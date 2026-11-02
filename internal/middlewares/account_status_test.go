package middlewares

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/safebucket/safebucket/internal/cache"
	"github.com/safebucket/safebucket/internal/database"
	"github.com/safebucket/safebucket/internal/models"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupAccountStatusTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })

	database.RunMigrations(sqlDB, database.DialectSQLite)
	database.RegisterCallbacks(db)

	return db
}

func seedAccount(t *testing.T, db *gorm.DB, status models.UserStatus) models.User {
	t.Helper()

	user := models.User{
		Email:        "user-" + string(status) + "@example.com",
		ProviderType: models.LocalProviderType,
		ProviderKey:  string(models.LocalProviderType),
		Role:         models.RoleUser,
		Status:       status,
		QuotaBytes:   models.DefaultUserQuotaBytes,
	}
	require.NoError(t, db.Create(&user).Error)
	return user
}

// runAccountGate exercises the middleware with a request that carries the state
// the earlier middlewares would have produced.
func runAccountGate(
	t *testing.T,
	db *gorm.DB,
	c cache.ICache,
	claims *models.UserClaims,
	excluded bool,
) *httptest.ResponseRecorder {
	t.Helper()

	handler := RequireActiveAccount(db, c)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("passed"))
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/buckets", nil)
	ctx := context.WithValue(req.Context(), AuthExcludedKey{}, excluded)
	if claims != nil {
		ctx = context.WithValue(ctx, models.UserClaimKey{}, *claims)
	}

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req.WithContext(ctx))

	return rec
}

func TestRequireActiveAccount(t *testing.T) {
	t.Run("lets an active account through", func(t *testing.T) {
		db := setupAccountStatusTestDB(t)
		user := seedAccount(t, db, models.UserStatusActive)
		mc := cache.NewMemoryCache()
		t.Cleanup(mc.Close)

		rec := runAccountGate(t, db, mc, &models.UserClaims{UserID: user.ID}, false)

		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "passed", rec.Body.String())
	})

	t.Run("blocks an account waiting for approval", func(t *testing.T) {
		db := setupAccountStatusTestDB(t)
		user := seedAccount(t, db, models.UserStatusPending)
		mc := cache.NewMemoryCache()
		t.Cleanup(mc.Close)

		rec := runAccountGate(t, db, mc, &models.UserClaims{UserID: user.ID}, false)

		assert.Equal(t, http.StatusForbidden, rec.Code)
		assert.Contains(t, rec.Body.String(), "USER_PENDING_APPROVAL")
	})

	t.Run("blocks a suspended account", func(t *testing.T) {
		db := setupAccountStatusTestDB(t)
		user := seedAccount(t, db, models.UserStatusSuspended)
		mc := cache.NewMemoryCache()
		t.Cleanup(mc.Close)

		rec := runAccountGate(t, db, mc, &models.UserClaims{UserID: user.ID}, false)

		assert.Equal(t, http.StatusForbidden, rec.Code)
		assert.Contains(t, rec.Body.String(), "USER_SUSPENDED")
	})

	t.Run("treats a vanished account as unusable", func(t *testing.T) {
		db := setupAccountStatusTestDB(t)
		mc := cache.NewMemoryCache()
		t.Cleanup(mc.Close)

		rec := runAccountGate(t, db, mc, &models.UserClaims{UserID: uuid.New()}, false)

		assert.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("does not touch anonymous routes", func(t *testing.T) {
		db := setupAccountStatusTestDB(t)
		mc := cache.NewMemoryCache()
		t.Cleanup(mc.Close)

		// A pending account browsing the public catalog must stay possible.
		user := seedAccount(t, db, models.UserStatusPending)
		rec := runAccountGate(t, db, mc, &models.UserClaims{UserID: user.ID}, true)

		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("passes through when there are no claims at all", func(t *testing.T) {
		db := setupAccountStatusTestDB(t)
		mc := cache.NewMemoryCache()
		t.Cleanup(mc.Close)

		rec := runAccountGate(t, db, mc, nil, false)

		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("serves the second request from the cache", func(t *testing.T) {
		db := setupAccountStatusTestDB(t)
		user := seedAccount(t, db, models.UserStatusActive)
		mc := cache.NewMemoryCache()
		t.Cleanup(mc.Close)

		claims := &models.UserClaims{UserID: user.ID}
		require.Equal(t, http.StatusOK, runAccountGate(t, db, mc, claims, false).Code)

		// Changing the row without invalidating the cache must not be visible
		// yet: that is the documented worst-case enforcement delay.
		require.NoError(t, db.Model(&models.User{}).Where("id = ?", user.ID).
			Update("status", models.UserStatusSuspended).Error)

		assert.Equal(t, http.StatusOK, runAccountGate(t, db, mc, claims, false).Code)

		InvalidateAccountStatusCache(mc, user.ID.String())
		assert.Equal(t, http.StatusForbidden, runAccountGate(t, db, mc, claims, false).Code)
	})
}
