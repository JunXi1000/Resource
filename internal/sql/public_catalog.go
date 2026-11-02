package sql

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	apierrors "github.com/safebucket/safebucket/internal/errors"
	h "github.com/safebucket/safebucket/internal/helpers"
	"github.com/safebucket/safebucket/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	// DefaultPublicPageSize keeps the anonymous landing page payload small
	// enough for mobile connections.
	DefaultPublicPageSize = 20
	// MaxPublicPageSize bounds the work a single anonymous request can cause.
	MaxPublicPageSize = 100
	// maxPublicFolderDepth stops a corrupted parent chain from looping forever
	// while walking breadcrumbs.
	maxPublicFolderDepth = 32
	// maxPublicFoldersPerLevel bounds the folder listing of one directory.
	maxPublicFoldersPerLevel = 500
)

// publicBucketRow is the internal shape of a catalog row: the public
// projection plus the columns needed to build the next cursor. The sort key is
// assembled in Go instead of being selected as a COALESCE expression, because
// SQLite does not attach a type to computed columns and the driver then refuses
// to scan them into time.Time.
type publicBucketRow struct {
	ID          uuid.UUID
	Slug        *string
	Name        string
	Description string
	Category    *string
	PublishedAt *time.Time
	CreatedAt   time.Time
	FileCount   int64
	TotalSize   int64
}

// publicFileStats aggregates the files that an anonymous visitor can actually
// download. Pending-review and still-uploading rows must not be counted,
// otherwise the catalog would advertise files that 404 on download.
func publicFileStats(db *gorm.DB) *gorm.DB {
	return db.Table("files AS f").
		Select("f.bucket_id AS bucket_id, COUNT(*) AS file_count, "+
			"COALESCE(SUM(COALESCE(v.size, 0)), 0) AS total_size").
		Joins("LEFT JOIN file_versions AS v ON v.id = COALESCE(f.current_version_id, f.id)").
		Where("f.deleted_at IS NULL").
		Where("f.status = ?", models.FileStatusUploaded).
		Where("f.review_status = ?", models.ReviewStatusApproved).
		Where("f.expires_at IS NULL OR f.expires_at > ?", time.Now().UTC()).
		Group("f.bucket_id")
}

// publicBucketFilter applies the visibility rules shared by every catalog
// entry point. It is the only place that decides what "public" means.
func publicBucketFilter(db *gorm.DB) *gorm.DB {
	return db.Table("buckets").
		Select("buckets.id, buckets.slug, buckets.name, buckets.description, buckets.category, "+
			"buckets.published_at, buckets.created_at, COALESCE(stats.file_count, 0) AS file_count, "+
			"COALESCE(stats.total_size, 0) AS total_size").
		Joins("LEFT JOIN (?) AS stats ON stats.bucket_id = buckets.id", publicFileStats(db)).
		Where("buckets.deleted_at IS NULL").
		Where("buckets.is_public = ?", true).
		Where("buckets.slug IS NOT NULL").
		Where("buckets.slug <> ''")
}

func toPublicBucketItem(row publicBucketRow) models.PublicBucketListItem {
	return models.PublicBucketListItem{
		ID:          row.ID,
		Slug:        row.Slug,
		Name:        row.Name,
		Description: row.Description,
		Category:    row.Category,
		Tags:        []string{},
		FileCount:   row.FileCount,
		TotalSize:   row.TotalSize,
		PublishedAt: row.PublishedAt,
	}
}

func attachPublicTags(db *gorm.DB, items []models.PublicBucketListItem) error {
	if len(items) == 0 {
		return nil
	}

	ids := make([]uuid.UUID, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.ID)
	}

	var tags []models.BucketTag
	if err := db.Where("bucket_id IN ?", ids).Order("tag ASC").Find(&tags).Error; err != nil {
		return err
	}

	grouped := make(map[uuid.UUID][]string, len(items))
	for _, tag := range tags {
		grouped[tag.BucketID] = append(grouped[tag.BucketID], tag.Tag)
	}

	for i := range items {
		if list, ok := grouped[items[i].ID]; ok {
			items[i].Tags = list
		}
	}

	return nil
}

// ListPublicBuckets returns one page of the public catalog. The extra row
// fetched beyond the limit tells us whether a next page exists without a
// second COUNT query.
func ListPublicBuckets(
	db *gorm.DB,
	params models.PublicBucketQuery,
) ([]models.PublicBucketListItem, *string, error) {
	limit := resolvePublicLimit(params.Limit)
	query := publicBucketFilter(db)

	if params.Query != "" {
		like := "%" + strings.ToLower(params.Query) + "%"
		query = query.Where(
			"(LOWER(buckets.name) LIKE ? OR LOWER(buckets.description) LIKE ?)", like, like,
		)
	}
	if params.Category != "" {
		query = query.Where("buckets.category = ?", params.Category)
	}
	if params.Tag != "" {
		query = query.Where(
			"EXISTS (SELECT 1 FROM bucket_tags AS bt WHERE bt.bucket_id = buckets.id AND bt.tag = ?)",
			params.Tag,
		)
	}

	query, err := applyPublicBucketSort(query, params)
	if err != nil {
		return nil, nil, err
	}

	var rows []publicBucketRow
	if findErr := query.Limit(limit + 1).Find(&rows).Error; findErr != nil {
		return nil, nil, findErr
	}

	var nextCursor *string
	if len(rows) > limit {
		rows = rows[:limit]
		cursor := h.EncodeCatalogCursor(publicBucketCursorValue(rows[len(rows)-1], params.Sort), rows[len(rows)-1].ID)
		nextCursor = &cursor
	}

	items := make([]models.PublicBucketListItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, toPublicBucketItem(row))
	}

	if tagErr := attachPublicTags(db, items); tagErr != nil {
		return nil, nil, tagErr
	}

	return items, nextCursor, nil
}

// GetPublicBucketBySlug loads a single catalog entry. Unknown slugs and
// private buckets return the same 404 so the endpoint cannot be used to probe
// for the existence of private buckets.
func GetPublicBucketBySlug(db *gorm.DB, slug string) (models.PublicBucketListItem, error) {
	var rows []publicBucketRow
	if err := publicBucketFilter(db).Where("buckets.slug = ?", slug).Limit(1).Find(&rows).Error; err != nil {
		return models.PublicBucketListItem{}, err
	}

	if len(rows) == 0 {
		return models.PublicBucketListItem{}, apierrors.New(http.StatusNotFound, apierrors.CodeBucketNotPublic)
	}

	items := []models.PublicBucketListItem{toPublicBucketItem(rows[0])}
	if err := attachPublicTags(db, items); err != nil {
		return models.PublicBucketListItem{}, err
	}

	return items[0], nil
}

func publicBucketCursorValue(row publicBucketRow, sort string) string {
	switch sort {
	case "name":
		return strings.ToLower(row.Name)
	case "popular":
		return strconv.FormatInt(row.FileCount, 10)
	default:
		return publicBucketSortAt(row).Format(time.RFC3339Nano)
	}
}

// publicBucketSortAt mirrors the ORDER BY expression: a published bucket sorts
// by its publication date, an unfinished publication falls back to creation.
func publicBucketSortAt(row publicBucketRow) time.Time {
	if row.PublishedAt != nil {
		return row.PublishedAt.UTC()
	}
	return row.CreatedAt.UTC()
}

func applyPublicBucketSort(query *gorm.DB, params models.PublicBucketQuery) (*gorm.DB, error) {
	sort := params.Sort
	if sort == "" {
		sort = "recent"
	}

	var cursor *h.CatalogCursor
	if params.Cursor != "" {
		decoded, err := h.DecodeCatalogCursor(params.Cursor)
		if err != nil {
			return nil, err
		}
		cursor = &decoded
	}

	switch sort {
	case "name":
		query = query.Order("LOWER(buckets.name) ASC").Order("buckets.id ASC")
		if cursor != nil {
			query = query.Where(
				"(LOWER(buckets.name) > ? OR (LOWER(buckets.name) = ? AND buckets.id > ?))",
				cursor.Value, cursor.Value, cursor.ID,
			)
		}

	case "popular":
		query = query.Order("COALESCE(stats.file_count, 0) DESC").Order("buckets.id DESC")
		if cursor != nil {
			count, err := strconv.ParseInt(cursor.Value, 10, 64)
			if err != nil {
				return nil, apierrors.New(http.StatusBadRequest, apierrors.CodeBadRequest)
			}
			query = query.Where(
				"(COALESCE(stats.file_count, 0) < ? OR (COALESCE(stats.file_count, 0) = ? AND buckets.id < ?))",
				count, count, cursor.ID,
			)
		}

	default:
		query = query.Order("COALESCE(buckets.published_at, buckets.created_at) DESC").Order("buckets.id DESC")
		if cursor != nil {
			ts, err := time.Parse(time.RFC3339Nano, cursor.Value)
			if err != nil {
				return nil, apierrors.New(http.StatusBadRequest, apierrors.CodeBadRequest)
			}
			query = query.Where(
				"(COALESCE(buckets.published_at, buckets.created_at) < ? OR "+
					"(COALESCE(buckets.published_at, buckets.created_at) = ? AND buckets.id < ?))",
				ts, ts, cursor.ID,
			)
		}
	}

	return query, nil
}

// ListPublicFiles returns the files of one folder of a public bucket.
func ListPublicFiles(
	db *gorm.DB,
	bucketID uuid.UUID,
	params models.PublicFileQuery,
) ([]models.PublicFileItem, *string, error) {
	limit := resolvePublicLimit(params.Limit)

	query := db.Table("files AS f").
		Select("f.id, f.name, f.extension, f.folder_id, f.created_at, COALESCE(v.size, 0) AS size").
		Joins("LEFT JOIN file_versions AS v ON v.id = COALESCE(f.current_version_id, f.id)").
		Where("f.bucket_id = ?", bucketID).
		Where("f.deleted_at IS NULL").
		Where("f.status = ?", models.FileStatusUploaded).
		Where("f.review_status = ?", models.ReviewStatusApproved).
		Where("f.expires_at IS NULL OR f.expires_at > ?", time.Now().UTC())

	query = applyPublicFolderScope(query, "f.folder_id", params.Folder)

	if params.Query != "" {
		query = query.Where("LOWER(f.name) LIKE ?", "%"+strings.ToLower(params.Query)+"%")
	}

	if params.Cursor != "" {
		cursor, err := h.DecodeCatalogCursor(params.Cursor)
		if err != nil {
			return nil, nil, err
		}
		query = query.Where(
			"(LOWER(f.name) > ? OR (LOWER(f.name) = ? AND f.id > ?))",
			cursor.Value, cursor.Value, cursor.ID,
		)
	}

	var items []models.PublicFileItem
	err := query.Order("LOWER(f.name) ASC").Order("f.id ASC").Limit(limit + 1).Find(&items).Error
	if err != nil {
		return nil, nil, err
	}

	var nextCursor *string
	if len(items) > limit {
		items = items[:limit]
		last := items[len(items)-1]
		cursor := h.EncodeCatalogCursor(strings.ToLower(last.Name), last.ID)
		nextCursor = &cursor
	}

	if items == nil {
		items = []models.PublicFileItem{}
	}

	return items, nextCursor, nil
}

// ListPublicFolders lists the sub-folders of one directory so the anonymous UI
// can drill down.
func ListPublicFolders(db *gorm.DB, bucketID uuid.UUID, folder string) ([]models.PublicFolderItem, error) {
	query := db.Table("folders").
		Select("id, name").
		Where("bucket_id = ?", bucketID).
		Where("deleted_at IS NULL").
		Where("status = ?", models.FolderStatusCreated)

	query = applyPublicFolderScope(query, "folder_id", folder)

	items := []models.PublicFolderItem{}
	err := query.Order("LOWER(name) ASC").Limit(maxPublicFoldersPerLevel).Find(&items).Error
	return items, err
}

// GetPublicFolder validates that a folder belongs to the bucket before the
// service trusts the folder id from the query string.
func GetPublicFolder(db *gorm.DB, bucketID, folderID uuid.UUID) (models.PublicFolderItem, error) {
	var item models.PublicFolderItem

	result := db.Table("folders").
		Select("id, name").
		Where("id = ? AND bucket_id = ? AND deleted_at IS NULL AND status = ?",
			folderID, bucketID, models.FolderStatusCreated).
		Limit(1).
		Find(&item)

	if result.Error != nil {
		return models.PublicFolderItem{}, result.Error
	}
	if result.RowsAffected == 0 {
		return models.PublicFolderItem{}, apierrors.New(http.StatusNotFound, apierrors.CodeFolderNotFound)
	}

	return item, nil
}

// publicFolderRow carries the parent pointer that the API projection omits.
type publicFolderRow struct {
	ID       uuid.UUID
	Name     string
	FolderID *uuid.UUID
}

// PublicBreadcrumb walks the folder chain up to the bucket root. A visited set
// guards against a corrupted parent pointer looping forever.
func PublicBreadcrumb(db *gorm.DB, bucketID, folderID uuid.UUID) []models.PublicFolderItem {
	breadcrumb := []models.PublicFolderItem{}
	seen := map[uuid.UUID]bool{}
	current := folderID

	for len(breadcrumb) < maxPublicFolderDepth {
		if seen[current] {
			break
		}
		seen[current] = true

		var row publicFolderRow
		result := db.Table("folders").
			Select("id, name, folder_id").
			Where("id = ? AND bucket_id = ? AND deleted_at IS NULL", current, bucketID).
			Limit(1).
			Scan(&row)

		if result.Error != nil || result.RowsAffected == 0 {
			break
		}

		breadcrumb = append([]models.PublicFolderItem{{ID: row.ID, Name: row.Name}}, breadcrumb...)

		if row.FolderID == nil {
			break
		}
		current = *row.FolderID
	}

	return breadcrumb
}

// ListPublicCategories returns the categories that currently have at least one
// published bucket, most populated first.
func ListPublicCategories(db *gorm.DB) ([]models.PublicCategoryItem, error) {
	items := []models.PublicCategoryItem{}

	err := db.Table("buckets").
		Select("category, COUNT(*) AS bucket_count").
		Where("deleted_at IS NULL").
		Where("is_public = ?", true).
		Where("slug IS NOT NULL AND slug <> ''").
		Where("category IS NOT NULL AND category <> ''").
		Group("category").
		Order("bucket_count DESC").
		Order("category ASC").
		Find(&items).Error

	return items, err
}

// GetPublicDownloadableFile resolves a file id to a file that an anonymous
// visitor is allowed to download. Every visibility rule is enforced in SQL, so
// bypassing the service layer cannot leak a private file.
func GetPublicDownloadableFile(db *gorm.DB, fileID uuid.UUID) (models.File, error) {
	var file models.File

	result := db.Table("files AS f").
		Select("f.*, COALESCE(v.size, 0) AS size").
		Joins("JOIN buckets AS b ON b.id = f.bucket_id").
		Joins("LEFT JOIN file_versions AS v ON v.id = COALESCE(f.current_version_id, f.id)").
		Where("f.id = ?", fileID).
		Where("f.deleted_at IS NULL").
		Where("f.status = ?", models.FileStatusUploaded).
		Where("f.review_status = ?", models.ReviewStatusApproved).
		Where("f.expires_at IS NULL OR f.expires_at > ?", time.Now().UTC()).
		Where("b.deleted_at IS NULL").
		Where("b.is_public = ?", true).
		Limit(1).
		Scan(&file)

	if result.Error != nil {
		return models.File{}, result.Error
	}
	if result.RowsAffected == 0 {
		return models.File{}, apierrors.New(http.StatusNotFound, apierrors.CodeFileNotFound)
	}

	return file, nil
}

func applyPublicFolderScope(query *gorm.DB, column, folder string) *gorm.DB {
	if folder == "" {
		return query.Where(column + " IS NULL")
	}
	return query.Where(column+" = ?", folder)
}

func resolvePublicLimit(limit int) int {
	if limit <= 0 {
		return DefaultPublicPageSize
	}
	if limit > MaxPublicPageSize {
		return MaxPublicPageSize
	}
	return limit
}
