package services

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/safebucket/safebucket/internal/cache"
	"github.com/safebucket/safebucket/internal/configuration"
	"github.com/safebucket/safebucket/internal/events"
	"github.com/safebucket/safebucket/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// newSignupRouter mounts the real /v1/auth router (including the register
// sub-router) so the test covers routing, body validation, whitespace handling
// and error serialisation, not just the service methods.
func newSignupRouter(t *testing.T) (chi.Router, *capturePublisher, *gorm.DB) {
	t.Helper()

	db := setupUserServiceTestDB(t)
	mc := cache.NewMemoryCache()
	t.Cleanup(mc.Close)
	pub := newCapturePublisher()

	authService := AuthService{
		DB:         db,
		Cache:      mc,
		AuthConfig: models.AuthConfig{WebURL: "http://localhost:8080", TokenSecret: "test-secret"},
		Providers: configuration.Providers{
			string(models.LocalProviderType): {Name: "Password", Type: models.LocalProviderType},
		},
		Publisher:            pub,
		ActivityLogger:       &MockActivityLogger{},
		Notifier:             &MockNotifier{},
		RegistrationEnabled:  true,
		RequireAdminApproval: true,
		DefaultQuotaBytes:    models.DefaultUserQuotaBytes,
	}

	r := chi.NewRouter()
	// Stand-in for the ClientInfo middleware, which the signup handlers read to
	// apply the per-IP budget.
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx := context.WithValue(req.Context(), models.ClientInfoKey{},
				models.ClientInfo{IP: "203.0.113.7"})
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})
	r.Mount("/api/v1/auth", authService.Routes())

	return r, pub, db
}

func postJSON(t *testing.T, router chi.Router, path string, body any) *httptest.ResponseRecorder {
	t.Helper()

	raw, err := json.Marshal(body)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestSignupFlowOverHTTP(t *testing.T) {
	router, pub, db := newSignupRouter(t)

	// 1. Signup answers 202 and hides whether the address already exists.
	rec := postJSON(t, router, "/api/v1/auth/register", map[string]any{
		"email": "  Flow@Example.com ", "password": "correct-horse-battery", "first_name": "Ada",
	})
	require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())

	var signupResponse models.RegistrationResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &signupResponse))
	assert.Equal(t, models.RegistrationStatePendingVerification, signupResponse.Status)

	code := pub.lastVerificationCode(t)

	// 2. Wrong code is rejected without leaking anything.
	rec = postJSON(t, router, "/api/v1/auth/register/verify", map[string]any{
		"email": "flow@example.com", "code": "AAAAAA",
	})
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	assert.Contains(t, rec.Body.String(), "INVALID_VERIFICATION_CODE")

	// 3. The real code moves the account to the approval queue.
	rec = postJSON(t, router, "/api/v1/auth/register/verify", map[string]any{
		"email": "flow@example.com", "code": code,
	})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	var verifyResponse models.RegistrationResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &verifyResponse))
	assert.Equal(t, models.RegistrationStatePendingApproval, verifyResponse.Status)

	// 4. Logging in while pending fails with the code the UI needs.
	rec = postJSON(t, router, "/api/v1/auth/login", map[string]any{
		"email": "flow@example.com", "password": "correct-horse-battery",
	})
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
	assert.Contains(t, rec.Body.String(), "USER_PENDING_APPROVAL")

	// 5. After approval the same credentials work.
	var user models.User
	require.NoError(t, db.Where("email = ?", "flow@example.com").First(&user).Error)
	require.NoError(t, db.Model(&user).Update("status", models.UserStatusActive).Error)

	rec = postJSON(t, router, "/api/v1/auth/login", map[string]any{
		"email": "flow@example.com", "password": "correct-horse-battery",
	})
	assert.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.Contains(t, rec.Body.String(), "mfa_required")
}

func TestSignupRejectsMalformedInput(t *testing.T) {
	router, _, db := newSignupRouter(t)

	t.Run("weak password", func(t *testing.T) {
		rec := postJSON(t, router, "/api/v1/auth/register", map[string]any{
			"email": "short@example.com", "password": "abc",
		})
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Equal(t, int64(0), countUsers(t, db))
	})

	t.Run("invalid email", func(t *testing.T) {
		rec := postJSON(t, router, "/api/v1/auth/register", map[string]any{
			"email": "not-an-email", "password": "correct-horse-battery",
		})
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Equal(t, int64(0), countUsers(t, db))
	})

	t.Run("verification code of the wrong length", func(t *testing.T) {
		rec := postJSON(t, router, "/api/v1/auth/register/verify", map[string]any{
			"email": "x@example.com", "code": "12",
		})
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
}

func TestResendRouteIsAnonymousAndIdempotent(t *testing.T) {
	router, pub, _ := newSignupRouter(t)

	rec := postJSON(t, router, "/api/v1/auth/register/resend", map[string]any{
		"email": "unknown@example.com",
	})
	require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())
	assert.Equal(t, 0, pub.count(events.RegistrationChallengeName))
}
