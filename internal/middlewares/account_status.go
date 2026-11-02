package middlewares

import (
	"fmt"
	"net/http"

	"github.com/safebucket/safebucket/internal/cache"
	"github.com/safebucket/safebucket/internal/configuration"
	apierrors "github.com/safebucket/safebucket/internal/errors"
	"github.com/safebucket/safebucket/internal/helpers"
	"github.com/safebucket/safebucket/internal/models"
	"github.com/safebucket/safebucket/internal/tracing"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

// RequireActiveAccount rejects authenticated requests from accounts that are
// not usable yet (pending approval) or no longer usable (suspended).
//
// It is deliberately a separate middleware instead of a check inside
// Authenticate: sign-in itself must stay reachable for a suspended user,
// otherwise they would only see a generic 403 and never learn why. Login
// returns USER_PENDING_APPROVAL / USER_SUSPENDED explicitly and this
// middleware guards everything else.
//
// The status is cached for configuration.CacheAccountStatusTTL. That TTL is the
// worst-case delay between an admin approving or banning an account and the
// change taking effect, which is cheap enough to avoid a database round trip on
// every single request.
func RequireActiveAccount(db *gorm.DB, c cache.ICache) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Anonymous routes are handled by the endpoints themselves; the
			// public catalog and the share links must keep working.
			if excluded, ok := r.Context().Value(AuthExcludedKey{}).(bool); ok && excluded {
				next.ServeHTTP(w, r)
				return
			}

			claims, claimsErr := helpers.GetUserClaims(r.Context())
			if claimsErr != nil {
				// No claims yet: Authenticate already rejected the request, or
				// the route is public. Nothing to gate here.
				next.ServeHTTP(w, r)
				return
			}

			ctx, span := tracing.StartSpan(r.Context(), "middleware.RequireActiveAccount")
			defer span.End()
			r = r.WithContext(ctx)

			status, err := resolveAccountStatus(db, c, claims.UserID.String())
			if err != nil {
				zap.L().Error("Failed to resolve account status",
					zap.String("user_id", claims.UserID.String()), zap.Error(err))
				helpers.RespondWithErrorCtx(r.Context(), w, http.StatusInternalServerError,
					[]string{apierrors.CodeInternalServerError})
				return
			}

			switch status {
			case models.UserStatusActive:
				next.ServeHTTP(w, r)
			case models.UserStatusSuspended:
				helpers.RespondWithErrorCtx(r.Context(), w, http.StatusForbidden,
					[]string{apierrors.CodeUserSuspended})
			default:
				helpers.RespondWithErrorCtx(r.Context(), w, http.StatusForbidden,
					[]string{apierrors.CodeUserPendingApproval})
			}
		})
	}
}

func resolveAccountStatus(db *gorm.DB, c cache.ICache, userID string) (models.UserStatus, error) {
	key := fmt.Sprintf(configuration.CacheAccountStatusKey, userID)

	if cached, err := c.Get(key); err == nil && cached != "" {
		return models.UserStatus(cached), nil
	}

	var user models.User
	result := db.Select("status").Where("id = ?", userID).Limit(1).Find(&user)
	if result.Error != nil {
		return "", result.Error
	}
	if result.RowsAffected == 0 {
		// The account was deleted while its session is still alive.
		return models.UserStatusSuspended, nil
	}

	if _, err := c.SetNX(key, string(user.Status), configuration.CacheAccountStatusTTL); err != nil {
		zap.L().Warn("Failed to cache account status", zap.Error(err))
	}

	return user.Status, nil
}

// InvalidateAccountStatusCache drops the cached status of one account. It is
// called by the approval endpoints so an operator sees the effect immediately
// instead of waiting out the TTL.
func InvalidateAccountStatusCache(c cache.ICache, userID string) {
	key := fmt.Sprintf(configuration.CacheAccountStatusKey, userID)
	if err := c.Del(key); err != nil {
		zap.L().Warn("Failed to invalidate account status cache",
			zap.String("user_id", userID), zap.Error(err))
	}
}
