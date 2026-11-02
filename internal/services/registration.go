package services

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/safebucket/safebucket/internal/activity"
	"github.com/safebucket/safebucket/internal/cache"
	"github.com/safebucket/safebucket/internal/configuration"
	apierrors "github.com/safebucket/safebucket/internal/errors"
	"github.com/safebucket/safebucket/internal/events"
	"github.com/safebucket/safebucket/internal/handlers"
	h "github.com/safebucket/safebucket/internal/helpers"
	"github.com/safebucket/safebucket/internal/messaging"
	m "github.com/safebucket/safebucket/internal/middlewares"
	"github.com/safebucket/safebucket/internal/models"
	"github.com/safebucket/safebucket/internal/notifier"
	"github.com/safebucket/safebucket/internal/outbox"
	"github.com/safebucket/safebucket/internal/rbac"
	"github.com/safebucket/safebucket/internal/sql"

	"github.com/alexedwards/argon2id"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// RegistrationService implements self-service signup.
//
// The whole flow is designed so that no response reveals whether an email
// address already has an account. Register always answers 202 with the same
// body; the difference is only visible in the inbox, which belongs to the
// person who owns the address anyway.
type RegistrationService struct {
	DB                   *gorm.DB
	Cache                cache.ICache
	AuthConfig           models.AuthConfig
	Providers            configuration.Providers
	Publisher            messaging.IPublisher
	ActivityLogger       activity.IActivityLogger
	Notifier             notifier.INotifier
	RegistrationEnabled  bool
	RequireAdminApproval bool
	DefaultQuotaBytes    int64
}

func (s RegistrationService) Routes() chi.Router {
	r := chi.NewRouter()

	r.With(m.Validate[models.RegistrationBody]).Post("/", s.registerHandler())

	// 200, not 201: verifying an address moves an existing account forward, it
	// does not create a resource.
	r.With(m.Validate[models.RegistrationVerifyBody]).
		Post("/verify", handlers.BodyResponseHandler(s.VerifyRegistration, http.StatusOK))

	r.With(m.Validate[models.RegistrationResendBody]).Post("/resend", s.resendHandler())

	return r
}

// registerHandler is a hand-written handler instead of the generic CreateHandler
// because signup rate limiting needs the client IP, which the generic handler
// wrappers do not expose to the service layer.
func (s RegistrationService) registerHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		logger := m.GetLogger(r)

		body, ok := r.Context().Value(m.BodyKey{}).(models.RegistrationBody)
		if !ok {
			logger.Error("Failed to extract registration body from context")
			h.RespondWithError(w, http.StatusInternalServerError, []string{apierrors.CodeInternalServerError})
			return
		}

		client, _ := r.Context().Value(models.ClientInfoKey{}).(models.ClientInfo)

		if err := s.Register(logger, client.IP, body); err != nil {
			var apiErr *apierrors.APIError
			if errors.As(err, &apiErr) {
				h.RespondWithError(w, apiErr.Status, []string{apiErr.Code})
				return
			}
			h.RespondWithError(w, http.StatusInternalServerError, []string{apierrors.CodeInternalServerError})
			return
		}

		h.RespondWithJSON(w, http.StatusAccepted, models.RegistrationResponse{
			Status: models.RegistrationStatePendingVerification,
		})
	}
}

func (s RegistrationService) resendHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		logger := m.GetLogger(r)

		body, ok := r.Context().Value(m.BodyKey{}).(models.RegistrationResendBody)
		if !ok {
			logger.Error("Failed to extract resend body from context")
			h.RespondWithError(w, http.StatusInternalServerError, []string{apierrors.CodeInternalServerError})
			return
		}

		client, _ := r.Context().Value(models.ClientInfoKey{}).(models.ClientInfo)

		if err := s.ResendVerification(logger, client.IP, body); err != nil {
			var apiErr *apierrors.APIError
			if errors.As(err, &apiErr) {
				h.RespondWithError(w, apiErr.Status, []string{apiErr.Code})
				return
			}
			h.RespondWithError(w, http.StatusInternalServerError, []string{apierrors.CodeInternalServerError})
			return
		}

		h.RespondWithJSON(w, http.StatusAccepted, models.RegistrationResponse{
			Status: models.RegistrationStatePendingVerification,
		})
	}
}

// Register creates an unverified account and mails a verification code.
func (s RegistrationService) Register(
	logger *zap.Logger,
	clientIP string,
	body models.RegistrationBody,
) error {
	body.NormalizeEmail()

	if !s.RegistrationEnabled {
		return apierrors.New(http.StatusForbidden, apierrors.CodeRegistrationDisabled)
	}

	provider, ok := s.Providers[string(models.LocalProviderType)]
	if !ok {
		logger.Debug("Local auth provider not activated in the configuration")
		return apierrors.New(http.StatusForbidden, apierrors.CodeRegistrationDisabled)
	}

	if !h.IsDomainAllowed(body.Email, provider.Domains) {
		logger.Debug("Registration domain not allowed", zap.String("email", body.Email))
		return apierrors.New(http.StatusForbidden, apierrors.CodeRegistrationDisabled)
	}

	if err := s.enforceIssuanceLimits(logger, clientIP, body.Email); err != nil {
		return err
	}

	existing, found, err := sql.FindUserByEmailAnyState(s.DB, body.Email)
	if err != nil {
		logger.Error("Failed to look up user during registration", zap.Error(err))
		return apierrors.New(http.StatusInternalServerError, apierrors.CodeInternalServerError)
	}

	if found {
		return s.handleExistingAccount(logger, &existing, body.Password)
	}

	return s.createUnverifiedAccount(logger, body)
}

// handleExistingAccount decides what to do when the email is already taken
// without ever telling the caller which branch was taken.
//
//   - soft-deleted or suspended accounts: do nothing, a human has to intervene
//   - verified accounts: do nothing, the owner already has a working login
//   - unverified accounts: resend the code, this is the common "I never got the
//     email" case and the only branch where mailing anything is useful
func (s RegistrationService) handleExistingAccount(
	logger *zap.Logger,
	user *models.User,
	password string,
) error {
	if user.DeletedAt.Valid {
		logger.Info("Registration attempt for a deleted account",
			zap.String("user_id", user.ID.String()))
		return nil
	}

	if user.Status == models.UserStatusSuspended {
		logger.Info("Registration attempt for a suspended account",
			zap.String("user_id", user.ID.String()))
		return nil
	}

	if user.EmailVerifiedAt != nil {
		logger.Info("Registration attempt for an existing account",
			zap.String("user_id", user.ID.String()))
		return nil
	}

	// The account exists but was never verified. Refresh the password in case
	// the user mistyped it the first time, then issue a new code.
	hashedPassword, err := h.CreateHash(password)
	if err != nil {
		logger.Error("Failed to hash password", zap.Error(err))
		return apierrors.New(http.StatusInternalServerError, apierrors.CodeInternalServerError)
	}

	if updateErr := s.DB.Model(user).Update("hashed_password", hashedPassword).Error; updateErr != nil {
		logger.Error("Failed to refresh password of unverified account", zap.Error(updateErr))
		return apierrors.New(http.StatusInternalServerError, apierrors.CodeInternalServerError)
	}

	return s.issueVerificationCode(logger, user)
}

func (s RegistrationService) createUnverifiedAccount(
	logger *zap.Logger,
	body models.RegistrationBody,
) error {
	hashedPassword, err := h.CreateHash(body.Password)
	if err != nil {
		logger.Error("Failed to hash password", zap.Error(err))
		return apierrors.New(http.StatusInternalServerError, apierrors.CodeInternalServerError)
	}

	quota := s.DefaultQuotaBytes
	if quota <= 0 {
		quota = models.DefaultUserQuotaBytes
	}

	newUser := models.User{
		FirstName:      body.FirstName,
		LastName:       body.LastName,
		Email:          body.Email,
		HashedPassword: hashedPassword,
		ProviderType:   models.LocalProviderType,
		ProviderKey:    string(models.LocalProviderType),
		Role:           models.RoleUser,
		Status:         models.UserStatusPending,
		QuotaBytes:     quota,
	}

	var secret string
	err = s.DB.Transaction(func(tx *gorm.DB) error {
		if createErr := tx.Create(&newUser).Error; createErr != nil {
			return createErr
		}

		var challengeErr error
		secret, challengeErr = s.createChallenge(tx, &newUser)
		if challengeErr != nil {
			return challengeErr
		}

		action := models.Activity{
			Message: activity.UserRegistered,
			Object:  newUser.ToActivity(),
			Filter: activity.NewLogFilter(models.ActivityFields{
				Action:     activity.UserRegistered,
				UserID:     newUser.ID.String(),
				ObjectType: rbac.ResourceUser.String(),
			}),
		}
		return outbox.AddActivities(tx, action)
	})
	if err != nil {
		logger.Error("Failed to create registered account", zap.Error(err))
		return apierrors.New(http.StatusInternalServerError, apierrors.CodeInternalServerError)
	}

	s.sendVerificationEmail(newUser.Email, secret)

	logger.Info("Self-service registration created an unverified account",
		zap.String("user_id", newUser.ID.String()))

	return nil
}

// issueVerificationCode rotates the code of an existing unverified account.
func (s RegistrationService) issueVerificationCode(logger *zap.Logger, user *models.User) error {
	var secret string
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		var challengeErr error
		secret, challengeErr = s.createChallenge(tx, user)
		return challengeErr
	})
	if err != nil {
		logger.Error("Failed to issue registration challenge", zap.Error(err))
		return apierrors.New(http.StatusInternalServerError, apierrors.CodeInternalServerError)
	}

	s.sendVerificationEmail(user.Email, secret)
	return nil
}

func (s RegistrationService) createChallenge(tx *gorm.DB, user *models.User) (string, error) {
	secret, err := h.GenerateSecret()
	if err != nil {
		return "", err
	}

	hashedSecret, err := h.CreateHash(secret)
	if err != nil {
		return "", err
	}

	// One live challenge per user: idx_challenge_user is unique on user_id
	// alone, not on (user_id, type), so a leftover password-reset challenge
	// would make this insert fail. Clearing every type is therefore correct,
	// not just the registration one.
	if deleteErr := tx.Where("user_id = ?", user.ID).
		Delete(&models.Challenge{}).Error; deleteErr != nil {
		return "", deleteErr
	}

	expiresAt := time.Now().Add(configuration.SecurityChallengeExpirationMinutes * time.Minute)
	challenge := models.Challenge{
		Type:         models.ChallengeTypeRegistration,
		UserID:       &user.ID,
		HashedSecret: hashedSecret,
		ExpiresAt:    &expiresAt,
		AttemptsLeft: configuration.SecurityChallengeMaxFailedAttempts,
	}
	if createErr := tx.Create(&challenge).Error; createErr != nil {
		return "", createErr
	}

	return secret, nil
}

func (s RegistrationService) sendVerificationEmail(email, secret string) {
	event := events.NewRegistrationChallenge(
		s.Publisher,
		secret,
		email,
		s.AuthConfig.WebURL,
		configuration.SecurityChallengeExpirationMinutes,
	)
	event.Trigger()
}

// VerifyRegistration consumes the emailed code and moves the account forward.
func (s RegistrationService) VerifyRegistration(
	_ *zap.Logger,
	_ models.UserClaims,
	_ uuid.UUIDs,
	body models.RegistrationVerifyBody,
) (models.RegistrationResponse, error) {
	body.NormalizeEmail()

	user, found, err := sql.FindUserByEmailAnyState(s.DB, body.Email)
	if err != nil {
		return models.RegistrationResponse{}, apierrors.New(
			http.StatusInternalServerError, apierrors.CodeInternalServerError,
		)
	}
	if !found || user.DeletedAt.Valid {
		return models.RegistrationResponse{}, apierrors.New(
			http.StatusBadRequest, apierrors.CodeInvalidVerification,
		)
	}

	// Idempotent replay: the code is gone once consumed, but a client that
	// retries with the same request should still learn the current state.
	if user.EmailVerifiedAt != nil {
		return models.RegistrationResponse{Status: registrationStateFor(&user)}, nil
	}

	return s.consumeVerificationCode(body, &user)
}

func (s RegistrationService) consumeVerificationCode(
	body models.RegistrationVerifyBody,
	user *models.User,
) (models.RegistrationResponse, error) {
	var response models.RegistrationResponse
	var validationErr *apierrors.APIError

	err := s.DB.Transaction(func(tx *gorm.DB) error {
		var challenge models.Challenge
		result := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ? AND type = ?", user.ID, models.ChallengeTypeRegistration).
			First(&challenge)

		if result.RowsAffected == 0 {
			validationErr = apierrors.New(http.StatusBadRequest, apierrors.CodeInvalidVerification)
			return nil
		}

		if challenge.ExpiresAt != nil && time.Now().After(*challenge.ExpiresAt) {
			if deleteErr := tx.Delete(&challenge).Error; deleteErr != nil {
				return deleteErr
			}
			validationErr = apierrors.New(http.StatusBadRequest, apierrors.CodeInvalidVerification)
			return nil
		}

		match, matchErr := argon2id.ComparePasswordAndHash(strings.ToUpper(body.Code), challenge.HashedSecret)
		if matchErr != nil || !match {
			return s.handleFailedVerificationAttempt(tx, &challenge, &validationErr)
		}

		now := time.Now()
		updates := map[string]any{"email_verified_at": now}
		nextStatus := models.UserStatusPending
		if !s.RequireAdminApproval {
			nextStatus = models.UserStatusActive
		}
		updates["status"] = nextStatus

		if updateErr := tx.Model(&models.User{}).Where("id = ?", user.ID).Updates(updates).Error; updateErr != nil {
			return updateErr
		}

		if deleteErr := tx.Delete(&challenge).Error; deleteErr != nil {
			return deleteErr
		}

		action := models.Activity{
			Message: activity.UserEmailVerified,
			Object:  user.ToActivity(),
			Filter: activity.NewLogFilter(models.ActivityFields{
				Action:     activity.UserEmailVerified,
				UserID:     user.ID.String(),
				ObjectType: rbac.ResourceUser.String(),
			}),
		}

		user.Status = nextStatus
		user.EmailVerifiedAt = &now
		response.Status = registrationStateFor(user)

		return outbox.AddActivities(tx, action)
	})
	if err != nil {
		return models.RegistrationResponse{}, apierrors.New(
			http.StatusInternalServerError, apierrors.CodeInternalServerError,
		)
	}
	if validationErr != nil {
		return models.RegistrationResponse{}, validationErr
	}

	if response.Status == models.RegistrationStateActive {
		welcome := events.NewUserWelcome(s.Publisher, user.Email, s.AuthConfig.WebURL)
		welcome.Trigger()
	}

	return response, nil
}

func (s RegistrationService) handleFailedVerificationAttempt(
	tx *gorm.DB,
	challenge *models.Challenge,
	validationErr **apierrors.APIError,
) error {
	challenge.AttemptsLeft--

	if challenge.AttemptsLeft <= 0 {
		if deleteErr := tx.Delete(challenge).Error; deleteErr != nil {
			return deleteErr
		}
		*validationErr = apierrors.New(http.StatusForbidden, apierrors.CodeChallengeLocked)
		return nil
	}

	if saveErr := tx.Save(challenge).Error; saveErr != nil {
		return saveErr
	}

	*validationErr = apierrors.New(http.StatusBadRequest, apierrors.CodeInvalidVerification)
	return nil
}

// ResendVerification issues a new code for an unverified account. It always
// answers 202 so the endpoint cannot be used to test which addresses exist.
func (s RegistrationService) ResendVerification(
	logger *zap.Logger,
	clientIP string,
	body models.RegistrationResendBody,
) error {
	body.NormalizeEmail()

	if !s.RegistrationEnabled {
		return apierrors.New(http.StatusForbidden, apierrors.CodeRegistrationDisabled)
	}

	if err := s.enforceIssuanceLimits(logger, clientIP, body.Email); err != nil {
		return err
	}

	user, found, err := sql.FindUserByEmailAnyState(s.DB, body.Email)
	if err != nil {
		logger.Error("Failed to look up user during resend", zap.Error(err))
		return apierrors.New(http.StatusInternalServerError, apierrors.CodeInternalServerError)
	}

	if !found || user.DeletedAt.Valid ||
		user.Status == models.UserStatusSuspended ||
		user.EmailVerifiedAt != nil {
		logger.Debug("Resend requested for an account that needs no verification")
		return nil
	}

	return s.issueVerificationCode(logger, &user)
}

// enforceIssuanceLimits applies both the per-address and the per-IP budget.
// The IP budget matters most: an attacker rotating addresses would otherwise
// be able to send unlimited mail through this endpoint.
func (s RegistrationService) enforceIssuanceLimits(logger *zap.Logger, clientIP, email string) error {
	if err := enforceEmailIssuanceLimit(
		logger,
		s.Cache,
		string(models.ChallengeTypeRegistration),
		email,
		configuration.SecurityRegistrationMaxPerEmailPerHour,
	); err != nil {
		return err
	}

	if clientIP == "" {
		return nil
	}

	key := fmt.Sprintf(configuration.CacheRegistrationIssuanceIPKey, clientIP)
	allowed, err := cache.RecordChallengeIssuance(
		s.Cache,
		key,
		configuration.SecurityRegistrationMaxPerIPPerHour,
		configuration.SecurityChallengeIssuanceWindow,
	)
	if err != nil {
		logger.Error("Failed to record registration issuance by IP", zap.Error(err))
		return apierrors.New(http.StatusServiceUnavailable, apierrors.CodeServiceUnavailable)
	}
	if !allowed {
		return apierrors.New(http.StatusTooManyRequests, apierrors.CodeRateLimitExceeded)
	}

	return nil
}

func registrationStateFor(user *models.User) models.RegistrationState {
	if user.Status == models.UserStatusActive {
		return models.RegistrationStateActive
	}
	return models.RegistrationStatePendingApproval
}
