package services

import (
	"encoding/json"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/safebucket/safebucket/internal/cache"
	"github.com/safebucket/safebucket/internal/configuration"
	"github.com/safebucket/safebucket/internal/events"
	"github.com/safebucket/safebucket/internal/models"

	"github.com/ThreeDotsLabs/watermill/message"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// capturePublisher records published events so tests can read the verification
// code that would otherwise only exist inside an email.
type capturePublisher struct {
	mu     sync.Mutex
	byType map[string][]map[string]any
}

func newCapturePublisher() *capturePublisher {
	return &capturePublisher{byType: make(map[string][]map[string]any)}
}

func (p *capturePublisher) Publish(messages ...*message.Message) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	for _, msg := range messages {
		var payload map[string]any
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			return err
		}
		kind := msg.Metadata.Get("type")
		p.byType[kind] = append(p.byType[kind], payload)
	}
	return nil
}

func (p *capturePublisher) Close() error { return nil }

func (p *capturePublisher) last(kind string) map[string]any {
	p.mu.Lock()
	defer p.mu.Unlock()

	list := p.byType[kind]
	if len(list) == 0 {
		return nil
	}
	return list[len(list)-1]
}

func (p *capturePublisher) count(kind string) int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.byType[kind])
}

// lastVerificationCode returns the six-character code of the most recently
// published registration mail.
func (p *capturePublisher) lastVerificationCode(t *testing.T) string {
	t.Helper()

	payload := p.last(events.RegistrationChallengeName)
	require.NotNil(t, payload, "no registration challenge event was published")
	code, ok := payload["Secret"].(string)
	require.True(t, ok)
	require.Len(t, code, 6)
	return code
}

func newRegistrationTestService(t *testing.T) (RegistrationService, *capturePublisher, *gorm.DB) {
	t.Helper()

	db := setupUserServiceTestDB(t)
	mc := cache.NewMemoryCache()
	t.Cleanup(mc.Close)

	pub := newCapturePublisher()

	svc := RegistrationService{
		DB:         db,
		Cache:      mc,
		AuthConfig: models.AuthConfig{WebURL: "http://localhost:8080"},
		Providers: configuration.Providers{
			string(models.LocalProviderType): {
				Name: "Password",
				Type: models.LocalProviderType,
			},
		},
		Publisher:            pub,
		ActivityLogger:       &MockActivityLogger{},
		Notifier:             &MockNotifier{},
		RegistrationEnabled:  true,
		RequireAdminApproval: true,
		DefaultQuotaBytes:    models.DefaultUserQuotaBytes,
	}

	return svc, pub, db
}

func registrationBody(email string) models.RegistrationBody {
	return models.RegistrationBody{
		FirstName: "Ada",
		LastName:  "Lovelace",
		Email:     email,
		Password:  "correct-horse-battery",
	}
}

func countUsers(t *testing.T, db *gorm.DB) int64 {
	t.Helper()

	var count int64
	require.NoError(t, db.Model(&models.User{}).Count(&count).Error)
	return count
}

func TestRegister(t *testing.T) {
	t.Run("refuses when registration is disabled", func(t *testing.T) {
		svc, pub, db := newRegistrationTestService(t)
		svc.RegistrationEnabled = false

		err := svc.Register(zap.NewNop(), "203.0.113.7", registrationBody("closed@example.com"))

		requireAPIError(t, err, http.StatusForbidden, "REGISTRATION_DISABLED")
		assert.Equal(t, int64(0), countUsers(t, db))
		assert.Equal(t, 0, pub.count(events.RegistrationChallengeName))
	})

	t.Run("creates a pending unverified account and mails a code", func(t *testing.T) {
		svc, pub, db := newRegistrationTestService(t)

		require.NoError(t, svc.Register(zap.NewNop(), "203.0.113.7", registrationBody("new@example.com")))

		var user models.User
		require.NoError(t, db.Where("email = ?", "new@example.com").First(&user).Error)
		assert.Equal(t, models.UserStatusPending, user.Status)
		assert.Nil(t, user.EmailVerifiedAt)
		assert.Equal(t, models.RoleUser, user.Role)
		assert.Equal(t, models.DefaultUserQuotaBytes, user.QuotaBytes)
		assert.NotEmpty(t, user.HashedPassword)

		var challenge models.Challenge
		require.NoError(t, db.Where("user_id = ?", user.ID).First(&challenge).Error)
		assert.Equal(t, models.ChallengeTypeRegistration, challenge.Type)
		assert.Equal(t, configuration.SecurityChallengeMaxFailedAttempts, challenge.AttemptsLeft)

		assert.Equal(t, 1, pub.count(events.RegistrationChallengeName))
		pub.lastVerificationCode(t)
	})

	t.Run("email is normalised before storing", func(t *testing.T) {
		svc, _, db := newRegistrationTestService(t)

		body := registrationBody("MiXeD@Example.COM")
		require.NoError(t, svc.Register(zap.NewNop(), "203.0.113.7", body))

		var user models.User
		require.NoError(t, db.Where("email = ?", "mixed@example.com").First(&user).Error)
		assert.Equal(t, "mixed@example.com", user.Email)
	})

	t.Run("rotates the code for an unverified account instead of creating a duplicate", func(t *testing.T) {
		svc, pub, db := newRegistrationTestService(t)

		require.NoError(t, svc.Register(zap.NewNop(), "203.0.113.7", registrationBody("retry@example.com")))
		firstCode := pub.lastVerificationCode(t)

		require.NoError(t, svc.Register(zap.NewNop(), "203.0.113.7", registrationBody("retry@example.com")))
		secondCode := pub.lastVerificationCode(t)

		assert.Equal(t, int64(1), countUsers(t, db))
		assert.Equal(t, 2, pub.count(events.RegistrationChallengeName))
		assert.NotEqual(t, firstCode, secondCode, "a new signup attempt must invalidate the previous code")

		var count int64
		require.NoError(t, db.Model(&models.Challenge{}).Count(&count).Error)
		assert.Equal(t, int64(1), count, "the previous challenge must be replaced, not stacked")

		// The newest code is the one that works.
		_, err := svc.VerifyRegistration(zap.NewNop(), models.UserClaims{}, uuid.UUIDs{},
			models.RegistrationVerifyBody{Email: "retry@example.com", Code: secondCode})
		require.NoError(t, err)
	})

	t.Run("does not mail again for an already verified account", func(t *testing.T) {
		svc, pub, db := newRegistrationTestService(t)

		require.NoError(t, svc.Register(zap.NewNop(), "203.0.113.7", registrationBody("done@example.com")))
		code := pub.lastVerificationCode(t)
		_, err := svc.VerifyRegistration(zap.NewNop(), models.UserClaims{}, uuid.UUIDs{},
			models.RegistrationVerifyBody{Email: "done@example.com", Code: code})
		require.NoError(t, err)

		before := pub.count(events.RegistrationChallengeName)
		require.NoError(t, svc.Register(zap.NewNop(), "203.0.113.7", registrationBody("done@example.com")))

		assert.Equal(t, before, pub.count(events.RegistrationChallengeName),
			"a verified account must not trigger another verification mail")
		assert.Equal(t, int64(1), countUsers(t, db))
	})

	t.Run("refuses a domain outside the provider whitelist", func(t *testing.T) {
		svc, _, db := newRegistrationTestService(t)
		svc.Providers = configuration.Providers{
			string(models.LocalProviderType): {
				Name:    "Password",
				Type:    models.LocalProviderType,
				Domains: []string{"corp.example.com"},
			},
		}

		err := svc.Register(zap.NewNop(), "203.0.113.7", registrationBody("outsider@example.org"))

		requireAPIError(t, err, http.StatusForbidden, "REGISTRATION_DISABLED")
		assert.Equal(t, int64(0), countUsers(t, db))
	})
}

func TestVerifyRegistration(t *testing.T) {
	t.Run("keeps the account pending when admin approval is required", func(t *testing.T) {
		svc, pub, db := newRegistrationTestService(t)

		require.NoError(t, svc.Register(zap.NewNop(), "203.0.113.7", registrationBody("pending@example.com")))
		code := pub.lastVerificationCode(t)

		response, err := svc.VerifyRegistration(zap.NewNop(), models.UserClaims{}, uuid.UUIDs{},
			models.RegistrationVerifyBody{Email: "pending@example.com", Code: code})

		require.NoError(t, err)
		assert.Equal(t, models.RegistrationStatePendingApproval, response.Status)

		var user models.User
		require.NoError(t, db.Where("email = ?", "pending@example.com").First(&user).Error)
		assert.Equal(t, models.UserStatusPending, user.Status)
		require.NotNil(t, user.EmailVerifiedAt)
	})

	t.Run("activates the account directly when approval is not required", func(t *testing.T) {
		svc, pub, db := newRegistrationTestService(t)
		svc.RequireAdminApproval = false

		require.NoError(t, svc.Register(zap.NewNop(), "203.0.113.7", registrationBody("direct@example.com")))
		code := pub.lastVerificationCode(t)

		response, err := svc.VerifyRegistration(zap.NewNop(), models.UserClaims{}, uuid.UUIDs{},
			models.RegistrationVerifyBody{Email: "direct@example.com", Code: code})

		require.NoError(t, err)
		assert.Equal(t, models.RegistrationStateActive, response.Status)

		var user models.User
		require.NoError(t, db.Where("email = ?", "direct@example.com").First(&user).Error)
		assert.Equal(t, models.UserStatusActive, user.Status)
		assert.Equal(t, 1, pub.count(events.UserWelcomeName))
	})

	t.Run("deletes the challenge so the code cannot be replayed", func(t *testing.T) {
		svc, pub, db := newRegistrationTestService(t)

		require.NoError(t, svc.Register(zap.NewNop(), "203.0.113.7", registrationBody("replay@example.com")))
		code := pub.lastVerificationCode(t)

		_, err := svc.VerifyRegistration(zap.NewNop(), models.UserClaims{}, uuid.UUIDs{},
			models.RegistrationVerifyBody{Email: "replay@example.com", Code: code})
		require.NoError(t, err)

		var count int64
		require.NoError(t, db.Model(&models.Challenge{}).Where("type = ?", models.ChallengeTypeRegistration).
			Count(&count).Error)
		assert.Equal(t, int64(0), count)
	})

	t.Run("counts down attempts and locks after the configured maximum", func(t *testing.T) {
		svc, pub, db := newRegistrationTestService(t)

		require.NoError(t, svc.Register(zap.NewNop(), "203.0.113.7", registrationBody("bruteforce@example.com")))
		code := pub.lastVerificationCode(t)
		wrong := "000000"
		if code == wrong {
			wrong = "111111"
		}

		for attempt := 1; attempt < configuration.SecurityChallengeMaxFailedAttempts; attempt++ {
			_, err := svc.VerifyRegistration(zap.NewNop(), models.UserClaims{}, uuid.UUIDs{},
				models.RegistrationVerifyBody{Email: "bruteforce@example.com", Code: wrong})
			requireAPIError(t, err, http.StatusBadRequest, "INVALID_VERIFICATION_CODE")

			var challenge models.Challenge
			require.NoError(t, db.Where("type = ?", models.ChallengeTypeRegistration).First(&challenge).Error)
			assert.Equal(t, configuration.SecurityChallengeMaxFailedAttempts-attempt, challenge.AttemptsLeft)
		}

		_, err := svc.VerifyRegistration(zap.NewNop(), models.UserClaims{}, uuid.UUIDs{},
			models.RegistrationVerifyBody{Email: "bruteforce@example.com", Code: wrong})
		requireAPIError(t, err, http.StatusForbidden, "CHALLENGE_LOCKED")

		var count int64
		require.NoError(t, db.Model(&models.Challenge{}).Where("type = ?", models.ChallengeTypeRegistration).
			Count(&count).Error)
		assert.Equal(t, int64(0), count, "a locked challenge must be deleted")

		// Even the correct code is useless once the challenge is gone.
		_, err = svc.VerifyRegistration(zap.NewNop(), models.UserClaims{}, uuid.UUIDs{},
			models.RegistrationVerifyBody{Email: "bruteforce@example.com", Code: code})
		requireAPIError(t, err, http.StatusBadRequest, "INVALID_VERIFICATION_CODE")
	})

	t.Run("reports the current state when the client retries after success", func(t *testing.T) {
		svc, pub, _ := newRegistrationTestService(t)

		require.NoError(t, svc.Register(zap.NewNop(), "203.0.113.7", registrationBody("idem@example.com")))
		code := pub.lastVerificationCode(t)

		_, err := svc.VerifyRegistration(zap.NewNop(), models.UserClaims{}, uuid.UUIDs{},
			models.RegistrationVerifyBody{Email: "idem@example.com", Code: code})
		require.NoError(t, err)

		response, err := svc.VerifyRegistration(zap.NewNop(), models.UserClaims{}, uuid.UUIDs{},
			models.RegistrationVerifyBody{Email: "idem@example.com", Code: code})
		require.NoError(t, err)
		assert.Equal(t, models.RegistrationStatePendingApproval, response.Status)
	})

	t.Run("does not reveal whether the address exists", func(t *testing.T) {
		svc, _, _ := newRegistrationTestService(t)

		_, err := svc.VerifyRegistration(zap.NewNop(), models.UserClaims{}, uuid.UUIDs{},
			models.RegistrationVerifyBody{Email: "ghost@example.com", Code: "123456"})

		requireAPIError(t, err, http.StatusBadRequest, "INVALID_VERIFICATION_CODE")
	})
}

func TestResendVerification(t *testing.T) {
	t.Run("issues a new code for an unverified account", func(t *testing.T) {
		svc, pub, _ := newRegistrationTestService(t)

		require.NoError(t, svc.Register(zap.NewNop(), "203.0.113.7", registrationBody("resend@example.com")))
		first := pub.lastVerificationCode(t)

		require.NoError(t, svc.ResendVerification(zap.NewNop(), "203.0.113.9",
			models.RegistrationResendBody{Email: "resend@example.com"}))
		second := pub.lastVerificationCode(t)

		assert.NotEqual(t, first, second)
		assert.Equal(t, 2, pub.count(events.RegistrationChallengeName))
	})

	t.Run("stays silent for an unknown address", func(t *testing.T) {
		svc, pub, _ := newRegistrationTestService(t)

		require.NoError(t, svc.ResendVerification(zap.NewNop(), "203.0.113.9",
			models.RegistrationResendBody{Email: "nobody@example.com"}))

		assert.Equal(t, 0, pub.count(events.RegistrationChallengeName))
	})

	t.Run("stays silent for an already verified account", func(t *testing.T) {
		svc, pub, _ := newRegistrationTestService(t)

		require.NoError(t, svc.Register(zap.NewNop(), "203.0.113.7", registrationBody("verified@example.com")))
		code := pub.lastVerificationCode(t)
		_, err := svc.VerifyRegistration(zap.NewNop(), models.UserClaims{}, uuid.UUIDs{},
			models.RegistrationVerifyBody{Email: "verified@example.com", Code: code})
		require.NoError(t, err)

		before := pub.count(events.RegistrationChallengeName)
		require.NoError(t, svc.ResendVerification(zap.NewNop(), "203.0.113.9",
			models.RegistrationResendBody{Email: "verified@example.com"}))

		assert.Equal(t, before, pub.count(events.RegistrationChallengeName))
	})
}

func TestCheckAccountUsable(t *testing.T) {
	verified := time.Now()

	t.Run("active accounts pass", func(t *testing.T) {
		user := models.User{Status: models.UserStatusActive}
		require.NoError(t, checkAccountUsable(&user))
	})

	t.Run("unverified accounts are told to verify", func(t *testing.T) {
		user := models.User{Status: models.UserStatusPending}
		requireAPIError(t, checkAccountUsable(&user), http.StatusForbidden, "EMAIL_NOT_VERIFIED")
	})

	t.Run("verified but unapproved accounts are told to wait", func(t *testing.T) {
		user := models.User{Status: models.UserStatusPending, EmailVerifiedAt: &verified}
		requireAPIError(t, checkAccountUsable(&user), http.StatusForbidden, "USER_PENDING_APPROVAL")
	})

	t.Run("suspended accounts are told they are banned", func(t *testing.T) {
		user := models.User{Status: models.UserStatusSuspended}
		requireAPIError(t, checkAccountUsable(&user), http.StatusForbidden, "USER_SUSPENDED")
	})
}
