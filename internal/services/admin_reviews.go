package services

import (
	"errors"
	"net/http"

	"github.com/safebucket/safebucket/internal/activity"
	apierrors "github.com/safebucket/safebucket/internal/errors"
	"github.com/safebucket/safebucket/internal/handlers"
	h "github.com/safebucket/safebucket/internal/helpers"
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

// reviewActionObject is the audited payload of every moderation decision.
type reviewActionObject struct {
	FileID   string `json:"file_id"`
	Name     string `json:"name"`
	BucketID string `json:"bucket_id"`
	Reason   string `json:"reason,omitempty"`
}

// AdminReviewService owns the moderation queue for public content.
//
// Permission model (docs/public-portal-design.md §5.3): platform admins
// moderate everything; owners of a public bucket moderate their own bucket;
// contributors never moderate — not even their own uploads, which would be
// self-approval. That is why the routes are not wrapped in
// AuthorizeRole(RoleAdmin) like the rest of /admin: the owner path must get
// through, and every handler re-checks the matrix itself.
type AdminReviewService struct {
	DB             *gorm.DB
	ActivityLogger activity.IActivityLogger
}

func (s AdminReviewService) Routes() chi.Router {
	r := chi.NewRouter()

	r.With(m.ValidateQuery[models.AdminReviewListQueryParams]).Get("/", s.listHandler())

	r.Route("/{id0}", func(r chi.Router) {
		r.Post("/approve", handlers.ActionHandler(s.Approve))
		r.With(m.Validate[models.AdminReviewRejectBody]).
			Post("/reject", handlers.BodyHandler(s.Reject))
	})

	return r
}

func (s AdminReviewService) listHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		logger := m.GetLogger(r)
		claims, _ := h.GetUserClaims(r.Context())

		query, ok := r.Context().Value(models.QueryKey{}).(models.AdminReviewListQueryParams)
		if !ok {
			logger.Error("Failed to extract review query params from context")
			h.RespondWithError(w, http.StatusInternalServerError, []string{apierrors.CodeInternalServerError})
			return
		}

		var bucketScope []uuid.UUID
		if claims.Role != models.RoleAdmin {
			owned, err := sql.OwnedPublicBucketIDs(s.DB, claims.UserID)
			if err != nil {
				logger.Error("Failed to list owned public buckets", zap.Error(err))
				h.RespondWithError(w, http.StatusInternalServerError, []string{apierrors.CodeInternalServerError})
				return
			}
			bucketScope = owned
		}

		items, nextCursor, err := sql.ListFilesForReview(s.DB, query, bucketScope)
		if err != nil {
			var apiErr *apierrors.APIError
			if errors.As(err, &apiErr) {
				h.RespondWithError(w, apiErr.Status, []string{apiErr.Code})
				return
			}
			logger.Error("Failed to list reviews", zap.Error(err))
			h.RespondWithError(w, http.StatusInternalServerError, []string{apierrors.CodeInternalServerError})
			return
		}

		h.RespondWithJSON(w, http.StatusOK, models.Page[models.AdminReviewItem]{
			Data:       items,
			NextCursor: nextCursor,
		})
	}
}

// authorizeReviewer enforces the permission matrix for single-file actions.
func (s AdminReviewService) authorizeReviewer(
	claims models.UserClaims,
	bucket models.Bucket,
) error {
	if claims.Role == models.RoleAdmin {
		return nil
	}
	owner, err := sql.IsPublicBucketOwner(s.DB, claims.UserID, bucket.ID)
	if err != nil {
		return apierrors.New(http.StatusInternalServerError, apierrors.CodeInternalServerError)
	}
	if !owner {
		return apierrors.New(http.StatusForbidden, apierrors.CodeReviewNotAllowed)
	}
	return nil
}

// Approve marks the file's current version fit for the anonymous catalog.
func (s AdminReviewService) Approve(
	logger *zap.Logger,
	claims models.UserClaims,
	ids uuid.UUIDs,
) error {
	file, bucket, err := sql.GetFileWithBucket(s.DB, ids[0])
	if err != nil {
		return err
	}
	if err := s.authorizeReviewer(claims, bucket); err != nil {
		return err
	}

	var reviewed models.File
	err = s.DB.Transaction(func(tx *gorm.DB) error {
		var txErr error
		reviewed, txErr = sql.ReviewFile(tx, file, true, claims.UserID, nil)
		if txErr != nil {
			return txErr
		}
		return outbox.AddActivities(tx, models.Activity{
			Message: activity.FileReviewApproved,
			Object: reviewActionObject{
				FileID: reviewed.ID.String(), Name: reviewed.Name, BucketID: bucket.ID.String(),
			},
			Filter: activity.NewLogFilter(models.ActivityFields{
				Action:     activity.FileReviewApproved,
				BucketID:   bucket.ID.String(),
				FileID:     file.ID.String(),
				ObjectType: rbac.ResourceFile.String(),
				UserID:     claims.UserID.String(),
			}),
		})
	})
	if err != nil {
		var apiErr *apierrors.APIError
		if errors.As(err, &apiErr) {
			return apiErr
		}
		logger.Error("Failed to approve file", zap.String("file_id", file.ID.String()), zap.Error(err))
		return apierrors.New(http.StatusInternalServerError, apierrors.CodeInternalServerError)
	}

	logger.Info("File review approved",
		zap.String("file_id", file.ID.String()),
		zap.String("reviewed_by", claims.UserID.String()))
	return nil
}

// Reject blocks the file from the anonymous catalog and records why, so the
// uploader can fix the upload. On an already-approved file it acts as the
// takedown path.
func (s AdminReviewService) Reject(
	logger *zap.Logger,
	claims models.UserClaims,
	ids uuid.UUIDs,
	body models.AdminReviewRejectBody,
) error {
	file, bucket, err := sql.GetFileWithBucket(s.DB, ids[0])
	if err != nil {
		return err
	}
	if err := s.authorizeReviewer(claims, bucket); err != nil {
		return err
	}

	reason := body.Reason
	var reviewed models.File
	err = s.DB.Transaction(func(tx *gorm.DB) error {
		var txErr error
		reviewed, txErr = sql.ReviewFile(tx, file, false, claims.UserID, &reason)
		if txErr != nil {
			return txErr
		}
		return outbox.AddActivities(tx, models.Activity{
			Message: activity.FileReviewRejected,
			Object: reviewActionObject{
				FileID: reviewed.ID.String(), Name: reviewed.Name,
				BucketID: bucket.ID.String(), Reason: reason,
			},
			Filter: activity.NewLogFilter(models.ActivityFields{
				Action:     activity.FileReviewRejected,
				BucketID:   bucket.ID.String(),
				FileID:     file.ID.String(),
				ObjectType: rbac.ResourceFile.String(),
				UserID:     claims.UserID.String(),
			}),
		})
	})
	if err != nil {
		var apiErr *apierrors.APIError
		if errors.As(err, &apiErr) {
			return apiErr
		}
		logger.Error("Failed to reject file", zap.String("file_id", file.ID.String()), zap.Error(err))
		return apierrors.New(http.StatusInternalServerError, apierrors.CodeInternalServerError)
	}

	logger.Info("File review rejected",
		zap.String("file_id", file.ID.String()),
		zap.String("reviewed_by", claims.UserID.String()),
		zap.String("reason", reason))
	return nil
}
