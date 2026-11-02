package services

import (
	"net/http"
	"testing"
	"time"

	"github.com/safebucket/safebucket/internal/cache"
	"github.com/safebucket/safebucket/internal/events"
	"github.com/safebucket/safebucket/internal/models"
	"github.com/safebucket/safebucket/internal/sql"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

func newAdminUserTestService(t *testing.T) (AdminUserService, *capturePublisher, *gorm.DB) {
	t.Helper()

	db := setupUserServiceTestDB(t)
	mc := cache.NewMemoryCache()
	t.Cleanup(mc.Close)

	pub := newCapturePublisher()

	svc := AdminUserService{
		DB:             db,
		Cache:          mc,
		AuthConfig:     models.AuthConfig{WebURL: "http://localhost:8080"},
		Publisher:      pub,
		ActivityLogger: &MockActivityLogger{},
	}

	return svc, pub, db
}

func createTestUser(t *testing.T, db *gorm.DB, email string, status models.UserStatus) models.User {
	t.Helper()

	verified := status == models.UserStatusActive
	user := models.User{
		Email:           email,
		ProviderType:    models.LocalProviderType,
		ProviderKey:     string(models.LocalProviderType),
		Role:            models.RoleUser,
		Status:          status,
		HashedPassword:  "hash",
		QuotaBytes:      models.DefaultUserQuotaBytes,
		EmailVerifiedAt: nil,
	}
	if verified {
		now := time.Now()
		user.EmailVerifiedAt = &now
	}

	require.NoError(t, db.Create(&user).Error)
	return user
}

func TestApproveUser(t *testing.T) {
	t.Run("moves a pending account to active and stamps the reviewer", func(t *testing.T) {
		svc, pub, db := newAdminUserTestService(t)
		user := createTestUser(t, db, "approve@example.com", models.UserStatusPending)
		reviewer := uuid.New()
		quota := int64(53687091200)

		err := svc.Approve(zap.NewNop(), models.UserClaims{UserID: reviewer}, uuid.UUIDs{user.ID},
			models.AdminApproveUserBody{QuotaBytes: &quota})
		require.NoError(t, err)

		var stored models.User
		require.NoError(t, db.Where("id = ?", user.ID).First(&stored).Error)
		assert.Equal(t, models.UserStatusActive, stored.Status)
		require.NotNil(t, stored.ApprovedBy)
		assert.Equal(t, reviewer, *stored.ApprovedBy)
		require.NotNil(t, stored.ApprovedAt)
		assert.Equal(t, quota, stored.QuotaBytes)

		assert.Equal(t, 1, pub.count(events.RegistrationApprovedName))
		payload := pub.last(events.RegistrationApprovedName)
		require.NotNil(t, payload)
		assert.Equal(t, "approve@example.com", payload["To"])
	})

	t.Run("keeps the existing quota when none is supplied", func(t *testing.T) {
		svc, _, db := newAdminUserTestService(t)
		user := createTestUser(t, db, "keepquota@example.com", models.UserStatusPending)

		require.NoError(t, svc.Approve(zap.NewNop(), models.UserClaims{UserID: uuid.New()},
			uuid.UUIDs{user.ID}, models.AdminApproveUserBody{}))

		var stored models.User
		require.NoError(t, db.Where("id = ?", user.ID).First(&stored).Error)
		assert.Equal(t, models.DefaultUserQuotaBytes, stored.QuotaBytes)
	})

	t.Run("rejects an already active account", func(t *testing.T) {
		svc, _, db := newAdminUserTestService(t)
		user := createTestUser(t, db, "already@example.com", models.UserStatusActive)

		err := svc.Approve(zap.NewNop(), models.UserClaims{UserID: uuid.New()}, uuid.UUIDs{user.ID},
			models.AdminApproveUserBody{})

		requireAPIError(t, err, http.StatusConflict, "USER_STATUS_CONFLICT")
	})

	t.Run("reinstates a suspended account", func(t *testing.T) {
		svc, _, db := newAdminUserTestService(t)
		user := createTestUser(t, db, "banned@example.com", models.UserStatusActive)

		require.NoError(t, svc.Suspend(zap.NewNop(), models.UserClaims{UserID: uuid.New()},
			uuid.UUIDs{user.ID}, models.AdminSuspendUserBody{Reason: "abuse"}))
		require.NoError(t, svc.Approve(zap.NewNop(), models.UserClaims{UserID: uuid.New()},
			uuid.UUIDs{user.ID}, models.AdminApproveUserBody{}))

		var stored models.User
		require.NoError(t, db.Where("id = ?", user.ID).First(&stored).Error)
		assert.Equal(t, models.UserStatusActive, stored.Status)
	})
}

func TestRejectUser(t *testing.T) {
	t.Run("removes a pending account completely so the address can sign up again", func(t *testing.T) {
		svc, pub, db := newAdminUserTestService(t)
		user := createTestUser(t, db, "reject@example.com", models.UserStatusPending)

		require.NoError(t, svc.Reject(zap.NewNop(), models.UserClaims{UserID: uuid.New()},
			uuid.UUIDs{user.ID}, models.AdminRejectUserBody{Reason: "fake profile"}))

		var count int64
		require.NoError(t, db.Unscoped().Model(&models.User{}).Where("id = ?", user.ID).Count(&count).Error)
		assert.Equal(t, int64(0), count, "rejected signups must not linger as soft-deleted rows")

		assert.Equal(t, 1, pub.count(events.RegistrationRejectedName))
	})

	t.Run("refuses to reject a live account", func(t *testing.T) {
		svc, _, db := newAdminUserTestService(t)
		user := createTestUser(t, db, "live@example.com", models.UserStatusActive)

		err := svc.Reject(zap.NewNop(), models.UserClaims{UserID: uuid.New()}, uuid.UUIDs{user.ID},
			models.AdminRejectUserBody{Reason: "nope"})

		requireAPIError(t, err, http.StatusConflict, "USER_STATUS_CONFLICT")
	})
}

func TestSuspendUser(t *testing.T) {
	t.Run("bans an active account and revokes its sessions", func(t *testing.T) {
		svc, _, db := newAdminUserTestService(t)
		user := createTestUser(t, db, "suspend@example.com", models.UserStatusActive)
		require.NoError(t, cache.CreateSession(svc.Cache, user.ID.String(), "sid-1"))

		require.NoError(t, svc.Suspend(zap.NewNop(), models.UserClaims{UserID: uuid.New()},
			uuid.UUIDs{user.ID}, models.AdminSuspendUserBody{Reason: "malware upload"}))

		var stored models.User
		require.NoError(t, db.Where("id = ?", user.ID).First(&stored).Error)
		assert.Equal(t, models.UserStatusSuspended, stored.Status)

		active, err := cache.IsSessionActive(svc.Cache, user.ID.String(), "sid-1", time.Minute)
		require.NoError(t, err)
		assert.False(t, active, "banning a user must invalidate their live sessions")
	})

	t.Run("refuses to suspend a pending account", func(t *testing.T) {
		svc, _, db := newAdminUserTestService(t)
		user := createTestUser(t, db, "pendingban@example.com", models.UserStatusPending)

		err := svc.Suspend(zap.NewNop(), models.UserClaims{UserID: uuid.New()}, uuid.UUIDs{user.ID},
			models.AdminSuspendUserBody{Reason: "not yet approved"})

		requireAPIError(t, err, http.StatusConflict, "USER_STATUS_CONFLICT")
	})
}

func TestUpdateQuota(t *testing.T) {
	t.Run("sets an explicit quota", func(t *testing.T) {
		svc, _, db := newAdminUserTestService(t)
		user := createTestUser(t, db, "quota@example.com", models.UserStatusActive)

		require.NoError(t, svc.UpdateQuota(zap.NewNop(), models.UserClaims{UserID: uuid.New()},
			uuid.UUIDs{user.ID}, models.AdminUserQuotaBody{QuotaBytes: 1073741824}))

		var stored models.User
		require.NoError(t, db.Where("id = ?", user.ID).First(&stored).Error)
		assert.Equal(t, int64(1073741824), stored.QuotaBytes)
	})

	t.Run("zero means unlimited and must survive the update", func(t *testing.T) {
		svc, _, db := newAdminUserTestService(t)
		user := createTestUser(t, db, "unlimited@example.com", models.UserStatusActive)

		require.NoError(t, svc.UpdateQuota(zap.NewNop(), models.UserClaims{UserID: uuid.New()},
			uuid.UUIDs{user.ID}, models.AdminUserQuotaBody{QuotaBytes: 0}))

		var stored models.User
		require.NoError(t, db.Where("id = ?", user.ID).First(&stored).Error)
		assert.Equal(t, int64(0), stored.QuotaBytes,
			"a struct update would silently drop the zero value and keep the old quota")
	})
}

func TestListAdminUsers(t *testing.T) {
	t.Run("filters by status", func(t *testing.T) {
		_, _, db := newAdminUserTestService(t)
		createTestUser(t, db, "p1@example.com", models.UserStatusPending)
		createTestUser(t, db, "p2@example.com", models.UserStatusPending)
		createTestUser(t, db, "a1@example.com", models.UserStatusActive)

		pending, _, err := sql.ListAdminUsers(db, models.AdminUserListQueryParams{Status: "pending"})
		require.NoError(t, err)
		require.Len(t, pending, 2)
		for _, item := range pending {
			assert.Equal(t, models.UserStatusPending, item.Status)
		}

		all, _, err := sql.ListAdminUsers(db, models.AdminUserListQueryParams{})
		require.NoError(t, err)
		assert.Len(t, all, 3)
	})

	t.Run("pages with a keyset cursor without losing or repeating rows", func(t *testing.T) {
		_, _, db := newAdminUserTestService(t)
		const total = 5
		for i := range total {
			createTestUser(t, db, "page"+string(rune('a'+i))+"@example.com", models.UserStatusPending)
		}

		seen := make(map[uuid.UUID]bool)
		cursor := ""
		for range total {
			params := models.AdminUserListQueryParams{Limit: 2, Status: "pending"}
			if cursor != "" {
				params.Cursor = cursor
			}
			items, next, err := sql.ListAdminUsers(db, params)
			require.NoError(t, err)

			for _, item := range items {
				assert.False(t, seen[item.ID], "row %s appeared on two pages", item.ID)
				seen[item.ID] = true
			}

			if next == nil {
				break
			}
			cursor = *next
		}

		assert.Len(t, seen, total)
	})

	t.Run("searches by email", func(t *testing.T) {
		_, _, db := newAdminUserTestService(t)
		createTestUser(t, db, "findme@example.com", models.UserStatusPending)
		createTestUser(t, db, "other@example.com", models.UserStatusPending)

		items, _, err := sql.ListAdminUsers(db, models.AdminUserListQueryParams{Query: "findme"})
		require.NoError(t, err)
		require.Len(t, items, 1)
		assert.Equal(t, "findme@example.com", items[0].Email)
	})

	t.Run("rejects a tampered cursor", func(t *testing.T) {
		_, _, db := newAdminUserTestService(t)

		_, _, err := sql.ListAdminUsers(db, models.AdminUserListQueryParams{Cursor: "not-a-cursor"})

		requireAPIError(t, err, http.StatusBadRequest, "BAD_REQUEST")
	})
}
