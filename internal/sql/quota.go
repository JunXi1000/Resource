package sql

import (
	"net/http"
	"slices"
	"time"

	apierrors "github.com/safebucket/safebucket/internal/errors"
	"github.com/safebucket/safebucket/internal/models"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// chargeUsedBytes moves a user's quota counter by delta. The CASE expression is
// deliberate: it clamps at zero so a refund for a file that predates quota
// tracking (used_bytes never included it) cannot push the counter negative and
// trip the CHECK constraint. GREATEST/MAX differ between PostgreSQL and SQLite,
// so the portable CASE form is used instead.
func chargeUsedBytes(tx *gorm.DB, userID uuid.UUID, delta int64) error {
	if delta == 0 {
		return nil
	}
	result := tx.Model(&models.User{}).
		Where("id = ?", userID).
		UpdateColumn("used_bytes", gorm.Expr("CASE WHEN used_bytes + ? > 0 THEN used_bytes + ? ELSE 0 END", delta, delta))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		// The user row vanished mid-transaction; that is a data integrity
		// failure, never a client-visible quota problem.
		return apierrors.New(http.StatusInternalServerError, apierrors.CodeInternalServerError)
	}
	return nil
}

// ReserveQuota atomically pre-debits an upload from a user's quota.
//
// This is the only quota enforcement point that matters: presigned uploads
// bypass this server entirely, so a plain "check then sign" would let N
// concurrent uploads all pass the same check and oversell the quota. The
// conditional UPDATE serialises the decision inside the database.
//
// quota_bytes = 0 means unlimited.
func ReserveQuota(tx *gorm.DB, userID uuid.UUID, bytes int64) error {
	result := tx.Model(&models.User{}).
		Where("id = ? AND (quota_bytes = 0 OR used_bytes + ? <= quota_bytes)", userID, bytes).
		UpdateColumn("used_bytes", gorm.Expr("used_bytes + ?", bytes))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return apierrors.New(413, apierrors.CodeQuotaExceeded)
	}
	return nil
}

// GetOpenReservation returns the open (reserved) quota hold for an upload
// version, or nil when the version has none — versions created before quota
// tracking, and share uploads, legitimately have no reservation.
func GetOpenReservation(tx *gorm.DB, versionID uuid.UUID) (*models.UploadReservation, error) {
	var reservation models.UploadReservation
	result := tx.Where("version_id = ? AND state = ?", versionID, models.ReservationStateReserved).Find(&reservation)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, nil
	}
	return &reservation, nil
}

// SettleUploadQuota reconciles the quota once an upload version became the
// file's current version.
//
// Accounting rules:
//   - With an open reservation: the hold was already charged at the declared
//     size, so only the difference between actual and declared size moves the
//     counter (usually zero).
//   - Without a reservation (upload started before the upgrade): the full size
//     is charged now, which is what makes the feature safe to roll out on a
//     live instance.
//   - The replaced previous current version is refunded to ITS uploader, even
//     when that is a different user: storage is attributed to whoever uploaded
//     the version that is no longer served.
//
// Every step is idempotent because Complete refuses to run twice for the same
// version (status guard), and the reservation state guard makes the settle a
// no-op if the reaper already released the hold.
func SettleUploadQuota(tx *gorm.DB, version models.FileVersion, replacedVersion *models.FileVersion) error {
	if version.UploadedBy != nil {
		reservation, err := GetOpenReservation(tx, version.ID)
		if err != nil {
			return err
		}
		if reservation != nil {
			delta := int64(version.Size) - reservation.Bytes
			result := tx.Model(&models.UploadReservation{}).
				Where("id = ? AND state = ?", reservation.ID, models.ReservationStateReserved).
				UpdateColumn("state", models.ReservationStateSettled)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected > 0 {
				if err := chargeUsedBytes(tx, *version.UploadedBy, delta); err != nil {
					return err
				}
			}
		} else if err := chargeUsedBytes(tx, *version.UploadedBy, int64(version.Size)); err != nil {
			return err
		}
	}

	if replacedVersion != nil && replacedVersion.UploadedBy != nil {
		if err := chargeUsedBytes(tx, *replacedVersion.UploadedBy, -int64(replacedVersion.Size)); err != nil {
			return err
		}
	}
	return nil
}

// ReleaseReservation gives a held quota back. It is a no-op unless the hold is
// still open, so callers can fire it from every failure path without thinking
// about double refunds.
func ReleaseReservation(tx *gorm.DB, versionID uuid.UUID) error {
	var reservation models.UploadReservation
	result := tx.Where("version_id = ? AND state = ?", versionID, models.ReservationStateReserved).Find(&reservation)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return nil
	}

	claim := tx.Model(&models.UploadReservation{}).
		Where("id = ? AND state = ?", reservation.ID, models.ReservationStateReserved).
		UpdateColumn("state", models.ReservationStateReleased)
	if claim.Error != nil {
		return claim.Error
	}
	if claim.RowsAffected == 0 {
		return nil
	}
	return chargeUsedBytes(tx, reservation.UserID, -reservation.Bytes)
}

// ReapExpiredReservations releases every quota hold past its TTL in one pass
// and returns how many were released. Called periodically by the quota reaper
// worker; it is the safety net for uploads that never completed and were never
// explicitly aborted.
func ReapExpiredReservations(db *gorm.DB, now time.Time, limit int) (int64, error) {
	var expired []models.UploadReservation
	err := db.
		Where("state = ? AND expires_at < ?", models.ReservationStateReserved, now).
		Limit(limit).
		Find(&expired).Error
	if err != nil {
		return 0, err
	}

	var released int64
	for _, reservation := range expired {
		err := db.Transaction(func(tx *gorm.DB) error {
			claim := tx.Model(&models.UploadReservation{}).
				Where("id = ? AND state = ?", reservation.ID, models.ReservationStateReserved).
				UpdateColumn("state", models.ReservationStateReleased)
			if claim.Error != nil {
				return claim.Error
			}
			if claim.RowsAffected == 0 {
				return nil
			}
			if err := chargeUsedBytes(tx, reservation.UserID, -reservation.Bytes); err != nil {
				return err
			}
			released++
			return nil
		})
		if err != nil {
			zap.L().Warn("Failed to reap quota reservation",
				zap.String("reservation_id", reservation.ID.String()), zap.Error(err))
		}
	}
	return released, nil
}

// GetUserUsage reports quota consumption for the account settings page.
// ReservedBytes is the sum of open holds, so the number the user sees matches
// what enforcement actually reserves.
func GetUserUsage(db *gorm.DB, userID uuid.UUID) (models.UserUsage, error) {
	var user models.User
	result := db.Select("quota_bytes, used_bytes").Where("id = ?", userID).Find(&user)
	if result.Error != nil {
		return models.UserUsage{}, result.Error
	}
	if result.RowsAffected == 0 {
		return models.UserUsage{}, apierrors.New(404, apierrors.CodeUserNotFound)
	}

	var reserved int64
	err := db.Model(&models.UploadReservation{}).
		Where("user_id = ? AND state = ?", userID, models.ReservationStateReserved).
		Select("COALESCE(SUM(bytes), 0)").
		Scan(&reserved).Error
	if err != nil {
		return models.UserUsage{}, err
	}

	usage := models.UserUsage{
		QuotaBytes:    user.QuotaBytes,
		UsedBytes:     user.UsedBytes,
		ReservedBytes: reserved,
	}
	if usage.QuotaBytes > 0 {
		usage.Percent = float64(usage.UsedBytes) / float64(usage.QuotaBytes) * 100
	}
	return usage, nil
}

// RefundTrashedFiles credits back the quota of every file that is about to
// enter the trash. Trashed files do not consume quota during the retention
// window, so this must run BEFORE the status flip that hides the files, using
// the exact same scope as MarkFilesDeleting — otherwise a folder-trash and the
// refund could disagree on which files moved.
func RefundTrashedFiles(tx *gorm.DB, bucketID uuid.UUID, folderIDs, fileIDs uuid.UUIDs) error {
	folderScope := append(slices.Clone(folderIDs), uuid.Nil)
	fileScope := append(slices.Clone(fileIDs), uuid.Nil)

	var refunds []struct {
		Size       int64
		UploadedBy *uuid.UUID
	}
	err := tx.Raw(`
		WITH RECURSIVE folder_tree (id) AS (
			SELECT id
			FROM folders
			WHERE bucket_id = ? AND id IN ? AND deleted_at IS NULL AND status = ?
			UNION
			SELECT child.id
			FROM folders AS child
			JOIN folder_tree AS parent ON child.folder_id = parent.id
			WHERE child.bucket_id = ? AND child.deleted_at IS NULL AND child.status = ?
		)
		SELECT fv.size AS size, fv.uploaded_by AS uploaded_by
		FROM files f
		JOIN file_versions fv ON fv.id = COALESCE(f.current_version_id, f.id)
		WHERE f.bucket_id = ?
		  AND f.deleted_at IS NULL
		  AND f.status IN ?
		  AND (f.id IN ? OR f.folder_id IN (SELECT id FROM folder_tree))
		  AND fv.uploaded_by IS NOT NULL
	`,
		bucketID, folderScope, models.FolderStatusCreated,
		bucketID, models.FolderStatusCreated,
		bucketID,
		[]models.FileStatus{models.FileStatusUploading, models.FileStatusUploaded},
		fileScope,
	).Scan(&refunds).Error
	if err != nil {
		return err
	}

	seen := make(map[uuid.UUID]int64, len(refunds))
	for _, refund := range refunds {
		if refund.UploadedBy == nil {
			continue
		}
		// A folder trash can hit several versions uploaded by the same user;
		// aggregate so the counter moves once per user per call.
		seen[*refund.UploadedBy] += refund.Size
	}
	for userID, size := range seen {
		if err := chargeUsedBytes(tx, userID, -size); err != nil {
			return err
		}
	}
	return nil
}

// ChargeRestoredFile re-debits the quota of a file leaving the trash. The
// mirror of RefundTrashedFiles; no quota check happens here on purpose —
// restoring must never fail because the uploader filled the quota elsewhere in
// the meantime.
func ChargeRestoredFile(tx *gorm.DB, file models.File) error {
	var version models.FileVersion
	err := tx.Where("id = ?", file.ContentVersionID()).Find(&version).Error
	if err != nil {
		return err
	}
	if version.UploadedBy == nil || version.Size == 0 {
		return nil
	}
	return chargeUsedBytes(tx, *version.UploadedBy, int64(version.Size))
}
