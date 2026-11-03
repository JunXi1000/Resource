package sql

import (
	"net/http"
	"time"

	apierrors "github.com/safebucket/safebucket/internal/errors"
	h "github.com/safebucket/safebucket/internal/helpers"
	"github.com/safebucket/safebucket/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ListFilesForReview returns one page of the review queue, oldest first.
//
// bucketScope semantics: nil means "no restriction" (platform admin);
// an empty slice means the caller owns no public bucket and must see nothing;
// otherwise the caller only sees files inside the listed buckets.
func ListFilesForReview(
	db *gorm.DB,
	params models.AdminReviewListQueryParams,
	bucketScope []uuid.UUID,
) ([]models.AdminReviewItem, *string, error) {
	limit := params.Limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	type reviewRow struct {
		models.AdminReviewItem
		UploaderID        *uuid.UUID `gorm:"column:uploader_id"`
		UploaderFirstName *string    `gorm:"column:uploader_first_name"`
		UploaderLastName  *string    `gorm:"column:uploader_last_name"`
		UploaderEmail     *string    `gorm:"column:uploader_email"`
	}

	query := db.Table("files").
		Select("files.id, files.name, files.extension, files.review_status, files.reject_reason, "+
			"files.reviewed_at, files.created_at, files.bucket_id, "+
			"buckets.name AS bucket_name, "+
			"COALESCE(current_version.size, 0) AS size, "+
			"uploader.id AS uploader_id, uploader.first_name AS uploader_first_name, "+
			"uploader.last_name AS uploader_last_name, uploader.email AS uploader_email").
		Joins("JOIN buckets ON buckets.id = files.bucket_id AND buckets.deleted_at IS NULL").
		Joins("LEFT JOIN file_versions AS current_version "+
			"ON current_version.id = COALESCE(files.current_version_id, files.id)").
		Joins("LEFT JOIN users AS uploader ON uploader.id = current_version.uploaded_by").
		Where("files.deleted_at IS NULL").
		Where("files.status = ?", models.FileStatusUploaded)

	if params.Status != "" {
		query = query.Where("files.review_status = ?", params.Status)
	}
	if params.BucketID != "" {
		bucketID, err := uuid.Parse(params.BucketID)
		if err != nil {
			return nil, nil, apierrors.New(http.StatusBadRequest, apierrors.CodeInvalidValue)
		}
		query = query.Where("files.bucket_id = ?", bucketID)
	}
	if bucketScope != nil {
		if len(bucketScope) == 0 {
			return []models.AdminReviewItem{}, nil, nil
		}
		query = query.Where("files.bucket_id IN ?", bucketScope)
	}

	// Oldest waiting first: the queue drains in submission order.
	query = query.Order("files.created_at ASC").Order("files.id ASC")

	if params.Cursor != "" {
		cursor, err := h.DecodeCatalogCursor(params.Cursor)
		if err != nil {
			return nil, nil, err
		}
		ts, err := time.Parse(time.RFC3339Nano, cursor.Value)
		if err != nil {
			return nil, nil, apierrors.New(http.StatusBadRequest, apierrors.CodeBadRequest)
		}
		query = query.Where(
			"(files.created_at > ? OR (files.created_at = ? AND files.id > ?))",
			ts, ts, cursor.ID,
		)
	}

	var rows []reviewRow
	if err := query.Limit(limit + 1).Find(&rows).Error; err != nil {
		return nil, nil, err
	}

	items := make([]models.AdminReviewItem, 0, len(rows))
	for _, row := range rows {
		item := row.AdminReviewItem
		if row.UploaderID != nil {
			item.Uploader = &models.UserInfo{
				ID:        *row.UploaderID,
				FirstName: derefString(row.UploaderFirstName),
				LastName:  derefString(row.UploaderLastName),
				Email:     derefString(row.UploaderEmail),
			}
		}
		items = append(items, item)
	}

	var nextCursor *string
	if len(items) > limit {
		items = items[:limit]
		last := items[len(items)-1]
		encoded := h.EncodeCatalogCursor(last.CreatedAt.UTC().Format(time.RFC3339Nano), last.ID)
		nextCursor = &encoded
	}

	return items, nextCursor, nil
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// OwnedPublicBucketIDs lists the buckets a non-admin reviewer is allowed to
// moderate: public buckets where the caller is an owner.
func OwnedPublicBucketIDs(db *gorm.DB, userID uuid.UUID) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := db.Model(&models.Membership{}).
		Joins("JOIN buckets ON buckets.id = memberships.bucket_id "+
			"AND buckets.is_public = TRUE AND buckets.deleted_at IS NULL").
		Where("memberships.user_id = ? AND memberships.\"group\" = ? AND memberships.deleted_at IS NULL",
			userID, models.GroupOwner).
		Pluck("memberships.bucket_id", &ids).Error
	return ids, err
}

// IsPublicBucketOwner reports whether the user is an owner of the given
// public bucket — the non-admin path of the review permission matrix.
func IsPublicBucketOwner(db *gorm.DB, userID, bucketID uuid.UUID) (bool, error) {
	var count int64
	err := db.Model(&models.Membership{}).
		Joins("JOIN buckets ON buckets.id = memberships.bucket_id "+
			"AND buckets.is_public = TRUE AND buckets.deleted_at IS NULL").
		Where("memberships.user_id = ? AND memberships.bucket_id = ? "+
			"AND memberships.\"group\" = ? AND memberships.deleted_at IS NULL",
			userID, bucketID, models.GroupOwner).
		Count(&count).Error
	return count > 0, err
}

// GetFileWithBucket loads a file together with its bucket, for the review
// permission check. Trashed files are invisible to the queue.
func GetFileWithBucket(db *gorm.DB, fileID uuid.UUID) (models.File, models.Bucket, error) {
	var file models.File
	result := db.Unscoped().
		Where("files.id = ? AND files.deleted_at IS NULL", fileID).
		Find(&file)
	if result.Error != nil {
		return models.File{}, models.Bucket{}, result.Error
	}
	if result.RowsAffected == 0 {
		return models.File{}, models.Bucket{}, apierrors.New(http.StatusNotFound, apierrors.CodeFileNotFound)
	}

	var bucket models.Bucket
	if err := db.Where("id = ?", file.BucketID).First(&bucket).Error; err != nil {
		return models.File{}, models.Bucket{}, err
	}
	return file, bucket, nil
}

// ReviewFile applies a moderation decision with transition validation.
//
// Transitions (see docs/public-portal-design.md §5):
//   - approve: pending → approved; approved is accepted as an idempotent
//     no-op so double clicks never surface as errors.
//   - reject:  pending → rejected, and approved → rejected, which doubles as
//     the takedown path for content that was already public. An already
//     rejected file stays rejected (idempotent no-op).
//   - everything else is a 409.
func ReviewFile(
	tx *gorm.DB,
	file models.File,
	approve bool,
	reviewerID uuid.UUID,
	reason *string,
) (models.File, error) {
	// Take the row lock and re-read the status inside the transaction: two
	// moderators clicking at once must serialise on the current status, not
	// on the stale copy fetched before the transaction opened.
	lock := tx.Unscoped().Model(&models.File{}).
		Where("id = ?", file.ID).
		UpdateColumn("updated_at", gorm.Expr("updated_at"))
	if lock.Error != nil {
		return file, lock.Error
	}
	if lock.RowsAffected == 0 {
		return file, apierrors.New(http.StatusNotFound, apierrors.CodeFileNotFound)
	}
	if err := tx.Unscoped().Where("id = ?", file.ID).Find(&file).Error; err != nil {
		return file, err
	}
	if file.DeletedAt.Valid {
		return file, apierrors.New(http.StatusNotFound, apierrors.CodeFileNotFound)
	}

	now := time.Now()
	updates := map[string]interface{}{
		"reviewed_by": reviewerID,
		"reviewed_at": now,
	}

	if approve {
		switch file.ReviewStatus {
		case models.ReviewStatusApproved:
			return file, nil
		case models.ReviewStatusPending:
			updates["review_status"] = models.ReviewStatusApproved
			updates["reject_reason"] = nil
		default:
			return file, apierrors.New(http.StatusConflict, apierrors.CodeReviewInvalidTransition)
		}
	} else {
		switch file.ReviewStatus {
		case models.ReviewStatusRejected:
			return file, nil
		case models.ReviewStatusPending, models.ReviewStatusApproved:
			updates["review_status"] = models.ReviewStatusRejected
			updates["reject_reason"] = *reason
		default:
			return file, apierrors.New(http.StatusConflict, apierrors.CodeReviewInvalidTransition)
		}
	}

	result := tx.Model(&models.File{}).Where("id = ?", file.ID).Updates(updates)
	if result.Error != nil {
		return file, result.Error
	}

	// Refresh the in-memory copy so the caller can log and return the row.
	if err := tx.Where("id = ?", file.ID).Find(&file).Error; err != nil {
		return file, err
	}
	return file, nil
}

// CountPendingReviews powers the sidebar badge on the review console.
func CountPendingReviews(db *gorm.DB) (int64, error) {
	var count int64
	err := db.Model(&models.File{}).
		Joins("JOIN buckets ON buckets.id = files.bucket_id AND buckets.deleted_at IS NULL").
		Where("files.deleted_at IS NULL AND files.status = ? AND files.review_status = ?",
			models.FileStatusUploaded, models.ReviewStatusPending).
		Count(&count).Error
	return count, err
}
