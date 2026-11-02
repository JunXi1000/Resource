package sql

import (
	"net/http"
	"strings"
	"time"

	apierrors "github.com/safebucket/safebucket/internal/errors"
	h "github.com/safebucket/safebucket/internal/helpers"
	"github.com/safebucket/safebucket/internal/models"

	"gorm.io/gorm"
)

// FindUserByEmailAnyState looks up a local account by email, including
// soft-deleted rows.
//
// Signup has to see deleted rows: the unique index on (email, provider_key)
// ignores deleted_at, so a "hidden" soft-deleted account would make the insert
// fail with a constraint violation, surfacing as a 500 to an anonymous user.
func FindUserByEmailAnyState(db *gorm.DB, email string) (models.User, bool, error) {
	var user models.User
	result := db.Unscoped().
		Where("email = ? AND provider_type = ?", models.NormalizeEmail(email), models.LocalProviderType).
		Find(&user)
	if result.Error != nil {
		return models.User{}, false, result.Error
	}
	return user, result.RowsAffected > 0, nil
}

// ListAdminUsers returns one page of the approval queue.
//
// Sorting is (created_at DESC, id DESC) and pagination is keyset, matching the
// public catalog: a newly registered user arriving while an operator pages
// through the queue must not shift rows across page boundaries.
func ListAdminUsers(
	db *gorm.DB,
	params models.AdminUserListQueryParams,
) ([]models.AdminUserItem, *string, error) {
	limit := params.Limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	query := db.Table("users").
		Select("users.id, users.first_name, users.last_name, users.email, users.role, "+
			"users.status, users.email_verified_at, users.approved_by, users.approved_at, "+
			"users.quota_bytes, users.used_bytes, users.created_at").
		Where("users.deleted_at IS NULL").
		Where("users.provider_type = ?", models.LocalProviderType)

	if params.Status != "" {
		query = query.Where("users.status = ?", params.Status)
	}

	if params.Query != "" {
		like := "%" + strings.ToLower(params.Query) + "%"
		query = query.Where(
			"(LOWER(users.email) LIKE ? OR LOWER(users.first_name) LIKE ? OR LOWER(users.last_name) LIKE ?)",
			like, like, like,
		)
	}

	query = query.Order("users.created_at DESC").Order("users.id DESC")

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
			"(users.created_at < ? OR (users.created_at = ? AND users.id < ?))",
			ts, ts, cursor.ID,
		)
	}

	var items []models.AdminUserItem
	if err := query.Limit(limit + 1).Find(&items).Error; err != nil {
		return nil, nil, err
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

// CountUsersByStatus powers the operator dashboard badge. A missing status
// means "count everything".
func CountUsersByStatus(db *gorm.DB, status models.UserStatus) (int64, error) {
	query := db.Model(&models.User{})
	if status != "" {
		query = query.Where("status = ?", status)
	}

	var count int64
	if err := query.Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}
