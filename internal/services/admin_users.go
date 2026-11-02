package services

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/safebucket/safebucket/internal/activity"
	"github.com/safebucket/safebucket/internal/cache"
	apierrors "github.com/safebucket/safebucket/internal/errors"
	"github.com/safebucket/safebucket/internal/events"
	"github.com/safebucket/safebucket/internal/handlers"
	h "github.com/safebucket/safebucket/internal/helpers"
	"github.com/safebucket/safebucket/internal/messaging"
	m "github.com/safebucket/safebucket/internal/middlewares"
	"github.com/safebucket/safebucket/internal/models"
	"github.com/safebucket/safebucket/internal/outbox"
	"github.com/safebucket/safebucket/internal/rbac"
	"github.com/safebucket/safebucket/internal/sql"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// userAdminActionObject is the audited payload of every approval-queue action.
// It repeats the reason so an operator reading the activity log later does not
// have to cross-reference anything else.
type userAdminActionObject struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Reason string `json:"reason,omitempty"`
}

// formatBytes renders a quota for humans (mail body and audit trail).
func formatBytes(bytes int64) string {
	if bytes <= 0 {
		return "unlimited"
	}

	const unit = 1024
	units := []string{"B", "KiB", "MiB", "GiB", "TiB"}
	value := float64(bytes)
	index := 0
	for value >= unit && index < len(units)-1 {
		value /= unit
		index++
	}
	return fmt.Sprintf("%.0f %s", value, units[index])
}

// AdminUserService owns the approval queue: the operations an operator needs to
// turn a verified signup into a usable account, and to take an account away
// again when it is abused.
type AdminUserService struct {
	DB             *gorm.DB
	Cache          cache.ICache
	AuthConfig     models.AuthConfig
	Publisher      messaging.IPublisher
	ActivityLogger activity.IActivityLogger
}

func (s AdminUserService) Routes() chi.Router {
	r := chi.NewRouter()

	r.With(m.ValidateQuery[models.AdminUserListQueryParams]).Get("/", s.listUsersHandler())

	r.Route("/{id0}", func(r chi.Router) {
		r.With(m.Validate[models.AdminApproveUserBody]).
			Post("/approve", handlers.BodyHandlerWithStatus(s.Approve, http.StatusOK))
		r.With(m.Validate[models.AdminRejectUserBody]).
			Post("/reject", handlers.BodyHandler(s.Reject))
		r.With(m.Validate[models.AdminSuspendUserBody]).
			Post("/suspend", handlers.BodyHandler(s.Suspend))
		r.With(m.Validate[models.AdminUserQuotaBody]).
			Patch("/quota", handlers.BodyHandler(s.UpdateQuota))
	})

	return r
}

func (s AdminUserService) listUsersHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		logger := m.GetLogger(r)

		query, ok := r.Context().Value(models.QueryKey{}).(models.AdminUserListQueryParams)
		if !ok {
			logger.Error("Failed to extract admin user query params from context")
			h.RespondWithError(w, http.StatusInternalServerError, []string{apierrors.CodeInternalServerError})
			return
		}

		items, nextCursor, err := sql.ListAdminUsers(s.DB, query)
		if err != nil {
			var apiErr *apierrors.APIError
			if errors.As(err, &apiErr) {
				h.RespondWithError(w, apiErr.Status, []string{apiErr.Code})
				return
			}
			logger.Error("Failed to list users", zap.Error(err))
			h.RespondWithError(w, http.StatusInternalServerError, []string{apierrors.CodeInternalServerError})
			return
		}

		h.RespondWithJSON(w, http.StatusOK, models.Page[models.AdminUserItem]{
			Data:       items,
			NextCursor: nextCursor,
		})
	}
}

// Approve activates a pending signup, or reinstates a suspended account.
//
// An already active account is rejected with 409 instead of silently
// succeeding: an operator clicking "approve" on the wrong row should learn that
// nothing happened.
func (s AdminUserService) Approve(
	logger *zap.Logger,
	claims models.UserClaims,
	ids uuid.UUIDs,
	body models.AdminApproveUserBody,
) error {
	user, err := sql.GetUserByID(s.DB, ids[0])
	if err != nil {
		return err
	}

	if user.Status == models.UserStatusActive {
		return apierrors.New(http.StatusConflict, apierrors.CodeUserStatusConflict)
	}

	now := time.Now()
	approver := claims.UserID

	err = s.DB.Transaction(func(tx *gorm.DB) error {
		updates := map[string]any{
			"status":      models.UserStatusActive,
			"approved_by": approver,
			"approved_at": now,
		}
		if body.QuotaBytes != nil {
			updates["quota_bytes"] = *body.QuotaBytes
		}

		if updateErr := tx.Model(&models.User{}).Where("id = ?", user.ID).Updates(updates).Error; updateErr != nil {
			return updateErr
		}

		action := models.Activity{
			Message: activity.UserApproved,
			Object:  userAdminActionObject{UserID: user.ID.String(), Email: user.Email},
			Filter: activity.NewLogFilter(models.ActivityFields{
				Action:     activity.UserApproved,
				UserID:     user.ID.String(),
				ObjectType: rbac.ResourceUser.String(),
			}),
		}
		return outbox.AddActivities(tx, action)
	})
	if err != nil {
		logger.Error("Failed to approve user", zap.String("user_id", user.ID.String()), zap.Error(err))
		return apierrors.New(http.StatusInternalServerError, apierrors.CodeInternalServerError)
	}

	m.InvalidateAccountStatusCache(s.Cache, user.ID.String())

	if user.Status == models.UserStatusSuspended {
		action := models.Activity{
			Message: activity.UserReinstated,
			Object:  userAdminActionObject{UserID: user.ID.String(), Email: user.Email},
			Filter: activity.NewLogFilter(models.ActivityFields{
				Action:     activity.UserReinstated,
				UserID:     user.ID.String(),
				ObjectType: rbac.ResourceUser.String(),
			}),
		}
		if logErr := s.ActivityLogger.Send(action); logErr != nil {
			logger.Error("Failed to log reinstatement", zap.Error(logErr))
		}
	}

	quota := user.QuotaBytes
	if body.QuotaBytes != nil {
		quota = *body.QuotaBytes
	}

	approved := events.NewRegistrationApproved(
		s.Publisher,
		user.Email,
		s.AuthConfig.WebURL,
		formatBytes(quota),
	)
	approved.Trigger()

	logger.Info("User approved",
		zap.String("user_id", user.ID.String()),
		zap.String("approved_by", approver.String()))

	return nil
}

// Reject removes a pending signup.
//
// The row is hard-deleted on purpose: an account that never got approved has no
// buckets, no files and no history, and a soft-deleted row would keep holding
// the unique (email, provider_key) index, so the applicant could never register
// again.
func (s AdminUserService) Reject(
	logger *zap.Logger,
	_ models.UserClaims,
	ids uuid.UUIDs,
	body models.AdminRejectUserBody,
) error {
	user, err := sql.GetUserByID(s.DB, ids[0])
	if err != nil {
		return err
	}

	if user.Status != models.UserStatusPending || user.ApprovedAt != nil {
		return apierrors.New(http.StatusConflict, apierrors.CodeUserStatusConflict)
	}

	err = s.DB.Transaction(func(tx *gorm.DB) error {
		action := models.Activity{
			Message: activity.UserRejected,
			Object:  userAdminActionObject{UserID: user.ID.String(), Email: user.Email, Reason: body.Reason},
			Filter: activity.NewLogFilter(models.ActivityFields{
				Action:     activity.UserRejected,
				UserID:     user.ID.String(),
				ObjectType: rbac.ResourceUser.String(),
			}),
		}
		if logErr := outbox.AddActivities(tx, action); logErr != nil {
			return logErr
		}

		return tx.Unscoped().Where("id = ?", user.ID).Delete(&models.User{}).Error
	})
	if err != nil {
		logger.Error("Failed to reject user", zap.String("user_id", user.ID.String()), zap.Error(err))
		return apierrors.New(http.StatusInternalServerError, apierrors.CodeInternalServerError)
	}

	m.InvalidateAccountStatusCache(s.Cache, user.ID.String())

	rejected := events.NewRegistrationRejected(
		s.Publisher,
		user.Email,
		s.AuthConfig.WebURL,
		body.Reason,
	)
	rejected.Trigger()

	logger.Info("User registration rejected",
		zap.String("user_id", user.ID.String()),
		zap.String("reason", body.Reason))

	return nil
}

// Suspend bans an active account. Sessions are revoked immediately so the
// cached-status TTL does not leave a working token behind.
func (s AdminUserService) Suspend(
	logger *zap.Logger,
	_ models.UserClaims,
	ids uuid.UUIDs,
	body models.AdminSuspendUserBody,
) error {
	user, err := sql.GetUserByID(s.DB, ids[0])
	if err != nil {
		return err
	}

	if user.Status != models.UserStatusActive {
		return apierrors.New(http.StatusConflict, apierrors.CodeUserStatusConflict)
	}

	err = s.DB.Transaction(func(tx *gorm.DB) error {
		if updateErr := tx.Model(&models.User{}).
			Where("id = ?", user.ID).
			Update("status", models.UserStatusSuspended).Error; updateErr != nil {
			return updateErr
		}

		action := models.Activity{
			Message: activity.UserSuspended,
			Object:  userAdminActionObject{UserID: user.ID.String(), Email: user.Email, Reason: body.Reason},
			Filter: activity.NewLogFilter(models.ActivityFields{
				Action:     activity.UserSuspended,
				UserID:     user.ID.String(),
				ObjectType: rbac.ResourceUser.String(),
			}),
		}
		return outbox.AddActivities(tx, action)
	})
	if err != nil {
		logger.Error("Failed to suspend user", zap.String("user_id", user.ID.String()), zap.Error(err))
		return apierrors.New(http.StatusInternalServerError, apierrors.CodeInternalServerError)
	}

	m.InvalidateAccountStatusCache(s.Cache, user.ID.String())

	if revokeErr := cache.RevokeAllSessions(s.Cache, user.ID.String()); revokeErr != nil {
		logger.Error("Failed to revoke sessions of suspended user",
			zap.String("user_id", user.ID.String()), zap.Error(revokeErr))
	}

	logger.Info("User suspended",
		zap.String("user_id", user.ID.String()),
		zap.String("reason", body.Reason))

	return nil
}

// UpdateQuota changes the storage ceiling of an account. A value of 0 means
// unlimited, which is only reachable through this endpoint.
func (s AdminUserService) UpdateQuota(
	logger *zap.Logger,
	_ models.UserClaims,
	ids uuid.UUIDs,
	body models.AdminUserQuotaBody,
) error {
	user, err := sql.GetUserByID(s.DB, ids[0])
	if err != nil {
		return err
	}

	err = s.DB.Transaction(func(tx *gorm.DB) error {
		// Updates(map) is required: a struct update would drop quota_bytes=0
		// because zero values are ignored.
		if updateErr := tx.Model(&models.User{}).
			Where("id = ?", user.ID).
			Updates(map[string]any{"quota_bytes": body.QuotaBytes}).Error; updateErr != nil {
			return updateErr
		}

		action := models.Activity{
			Message: activity.UserQuotaUpdated,
			Object: userAdminActionObject{
				UserID: user.ID.String(),
				Email:  user.Email,
				Reason: formatBytes(body.QuotaBytes),
			},
			Filter: activity.NewLogFilter(models.ActivityFields{
				Action:     activity.UserQuotaUpdated,
				UserID:     user.ID.String(),
				ObjectType: rbac.ResourceUser.String(),
			}),
		}
		return outbox.AddActivities(tx, action)
	})
	if err != nil {
		logger.Error("Failed to update user quota", zap.String("user_id", user.ID.String()), zap.Error(err))
		return apierrors.New(http.StatusInternalServerError, apierrors.CodeInternalServerError)
	}

	logger.Info("User quota updated",
		zap.String("user_id", user.ID.String()),
		zap.Int64("quota_bytes", body.QuotaBytes))

	return nil
}
