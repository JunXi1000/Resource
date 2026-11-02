package sql

import (
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/safebucket/safebucket/internal/database"
	apierrors "github.com/safebucket/safebucket/internal/errors"
	"github.com/safebucket/safebucket/internal/models"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// newCatalogTestDB opens a database and runs the real migrations so the tests
// exercise the same DDL that shipping code uses.
//
// By default it uses an in-memory SQLite database. Set TEST_POSTGRES_DSN (and
// TEST_POSTGRES_RESET=1) to run the very same assertions against PostgreSQL,
// which is the only reliable way to catch dialect drift in the catalog SQL.
func newCatalogTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := os.Getenv("TEST_POSTGRES_DSN")
	dialect := database.DialectSQLite

	var dialector gorm.Dialector
	if dsn != "" {
		dialect = database.DialectPostgres
		dialector = postgres.Open(dsn)
	} else {
		dialector = sqlite.Open("file::memory:?cache=shared")
	}

	db, err := gorm.Open(dialector, &gorm.Config{Logger: logger.Discard})
	require.NoError(t, err)

	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })

	if dsn == "" {
		_, err = sqlDB.Exec("PRAGMA foreign_keys = ON")
		require.NoError(t, err)
	} else if os.Getenv("TEST_POSTGRES_RESET") == "1" {
		_, resetErr := sqlDB.Exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
		require.NoError(t, resetErr)
	}

	database.RunMigrations(sqlDB, dialect)
	database.RegisterCallbacks(db)

	return db
}

func uniqueCatalogToken(t *testing.T) string {
	t.Helper()

	return strings.ToLower(strings.Split(uuid.New().String(), "-")[0])
}

type catalogFixture struct {
	PublicA     models.Bucket
	PublicB     models.Bucket
	Private     models.Bucket
	Category    string
	Tag         string
	Prefix      string
	Approved    models.File
	Pending     models.File
	Expired     models.File
	PrivateFile models.File
}

func newCatalogFixture(t *testing.T, db *gorm.DB) catalogFixture {
	t.Helper()

	token := uniqueCatalogToken(t)
	category := "cat-" + token
	tag := "tag-" + token
	published := time.Now().UTC().Add(-time.Hour)

	user := models.User{
		Email:        "catalog-" + token + "@example.com",
		ProviderType: models.LocalProviderType,
		ProviderKey:  "catalog-" + token,
		Role:         models.RoleUser,
	}
	require.NoError(t, db.Create(&user).Error)

	slugA := "tools-" + token
	slugB := "games-" + token
	slugPrivate := "secret-" + token

	fixture := catalogFixture{
		Category: category,
		Tag:      tag,
		Prefix:   token,
		PublicA: models.Bucket{
			Name: "工具软件 " + token, Description: "alpha", CreatedBy: user.ID,
			IsPublic: true, Slug: &slugA, Category: &category, PublishedAt: &published,
		},
		PublicB: models.Bucket{
			Name: "游戏 " + token, Description: "beta", CreatedBy: user.ID,
			IsPublic: true, Slug: &slugB, Category: &category, PublishedAt: &published,
		},
		Private: models.Bucket{
			Name: "私有 " + token, CreatedBy: user.ID, IsPublic: false, Slug: &slugPrivate,
		},
	}

	for _, bucket := range []*models.Bucket{&fixture.PublicA, &fixture.PublicB, &fixture.Private} {
		require.NoError(t, db.Create(bucket).Error)
	}

	require.NoError(t, db.Create(&models.BucketTag{BucketID: fixture.PublicA.ID, Tag: tag}).Error)

	fixture.Approved = createCatalogFile(t, db, fixture.PublicA.ID, "approved-"+token+".txt", 100,
		models.FileStatusUploaded, models.ReviewStatusApproved, nil)
	fixture.Pending = createCatalogFile(t, db, fixture.PublicA.ID, "pending-"+token+".txt", 200,
		models.FileStatusUploaded, models.ReviewStatusPending, nil)
	createCatalogFile(t, db, fixture.PublicA.ID, "uploading-"+token+".txt", 300,
		models.FileStatusUploading, models.ReviewStatusApproved, nil)

	expired := time.Now().UTC().Add(-time.Minute)
	fixture.Expired = createCatalogFile(t, db, fixture.PublicA.ID, "expired-"+token+".txt", 400,
		models.FileStatusUploaded, models.ReviewStatusApproved, &expired)

	fixture.PrivateFile = createCatalogFile(t, db, fixture.Private.ID, "private-"+token+".txt", 500,
		models.FileStatusUploaded, models.ReviewStatusApproved, nil)

	return fixture
}

func createCatalogFile(
	t *testing.T,
	db *gorm.DB,
	bucketID uuid.UUID,
	name string,
	size int,
	status models.FileStatus,
	review models.ReviewStatus,
	expiresAt *time.Time,
) models.File {
	t.Helper()

	file := models.File{
		Name:         name,
		Extension:    ".txt",
		Status:       status,
		ReviewStatus: review,
		BucketID:     bucketID,
		ExpiresAt:    expiresAt,
	}
	require.NoError(t, db.Create(&file).Error)

	version := models.FileVersion{
		FileID:  file.ID,
		Version: 1,
		Size:    size,
		Status:  models.FileStatusUploaded,
	}
	require.NoError(t, db.Create(&version).Error)
	require.NoError(t, db.Model(&models.File{}).
		Where("id = ?", file.ID).
		Update("current_version_id", version.ID).Error)

	file.CurrentVersionID = &version.ID

	return file
}

func bucketIDs(items []models.PublicBucketListItem) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.ID)
	}
	return ids
}

func TestListPublicBucketsCountsOnlyDownloadableFiles(t *testing.T) {
	db := newCatalogTestDB(t)
	fixture := newCatalogFixture(t, db)

	items, nextCursor, err := ListPublicBuckets(db, models.PublicBucketQuery{Category: fixture.Category, Limit: 10})
	require.NoError(t, err)
	assert.Nil(t, nextCursor)
	require.Len(t, items, 2)

	byID := map[uuid.UUID]models.PublicBucketListItem{}
	for _, item := range items {
		byID[item.ID] = item
	}

	itemA, ok := byID[fixture.PublicA.ID]
	require.True(t, ok, "public bucket A must be listed")

	// Four files exist in A: approved, pending review, still uploading, expired.
	// Only the approved, unexpired one is downloadable, so only it may be counted.
	assert.Equal(t, int64(1), itemA.FileCount)
	assert.Equal(t, int64(100), itemA.TotalSize)
	assert.Equal(t, []string{fixture.Tag}, itemA.Tags)

	_, privateListed := byID[fixture.Private.ID]
	assert.False(t, privateListed, "private bucket must never appear in the catalog")
}

func TestListPublicBucketsFilters(t *testing.T) {
	db := newCatalogTestDB(t)
	fixture := newCatalogFixture(t, db)

	byName, _, err := ListPublicBuckets(db, models.PublicBucketQuery{Query: fixture.Prefix, Limit: 10})
	require.NoError(t, err)
	assert.ElementsMatch(t, []uuid.UUID{fixture.PublicA.ID, fixture.PublicB.ID}, bucketIDs(byName))

	byTag, _, err := ListPublicBuckets(db, models.PublicBucketQuery{Tag: fixture.Tag, Limit: 10})
	require.NoError(t, err)
	assert.Equal(t, []uuid.UUID{fixture.PublicA.ID}, bucketIDs(byTag))

	missing, _, err := ListPublicBuckets(db, models.PublicBucketQuery{Tag: "nope-" + fixture.Prefix, Limit: 10})
	require.NoError(t, err)
	assert.Empty(t, missing)
}

func TestListPublicBucketsPaginationHasNoGapsOrDuplicates(t *testing.T) {
	db := newCatalogTestDB(t)
	fixture := newCatalogFixture(t, db)

	first, cursor, err := ListPublicBuckets(db, models.PublicBucketQuery{
		Category: fixture.Category, Sort: "name", Limit: 1,
	})
	require.NoError(t, err)
	require.Len(t, first, 1)
	require.NotNil(t, cursor, "two matches with limit=1 must produce a cursor")

	second, secondCursor, err := ListPublicBuckets(db, models.PublicBucketQuery{
		Category: fixture.Category, Sort: "name", Limit: 1, Cursor: *cursor,
	})
	require.NoError(t, err)
	require.Len(t, second, 1)
	assert.Nil(t, secondCursor)

	all := append(bucketIDs(first), bucketIDs(second)...)
	assert.ElementsMatch(t, []uuid.UUID{fixture.PublicA.ID, fixture.PublicB.ID}, all)
}

func TestListPublicBucketsRejectsBrokenCursor(t *testing.T) {
	db := newCatalogTestDB(t)

	_, _, err := ListPublicBuckets(db, models.PublicBucketQuery{Cursor: "not-a-cursor"})
	require.Error(t, err)

	var apiErr *apierrors.APIError
	require.True(t, errors.As(err, &apiErr))
	assert.Equal(t, apierrors.CodeBadRequest, apiErr.Code)
}

func TestGetPublicBucketBySlugHidesPrivateBuckets(t *testing.T) {
	db := newCatalogTestDB(t)
	fixture := newCatalogFixture(t, db)

	bucket, err := GetPublicBucketBySlug(db, *fixture.PublicA.Slug)
	require.NoError(t, err)
	assert.Equal(t, fixture.PublicA.ID, bucket.ID)
	assert.Equal(t, int64(1), bucket.FileCount)

	_, privateErr := GetPublicBucketBySlug(db, *fixture.Private.Slug)
	require.Error(t, privateErr)

	var apiErr *apierrors.APIError
	require.True(t, errors.As(privateErr, &apiErr))
	assert.Equal(t, apierrors.CodeBucketNotPublic, apiErr.Code)
}

func TestListPublicFilesExcludesModeratedAndExpired(t *testing.T) {
	db := newCatalogTestDB(t)
	fixture := newCatalogFixture(t, db)

	files, nextCursor, err := ListPublicFiles(db, fixture.PublicA.ID, models.PublicFileQuery{Limit: 10})
	require.NoError(t, err)
	assert.Nil(t, nextCursor)
	require.Len(t, files, 1)
	assert.Equal(t, fixture.Approved.ID, files[0].ID)
	assert.Equal(t, int64(100), files[0].Size)

	search, _, err := ListPublicFiles(db, fixture.PublicA.ID, models.PublicFileQuery{Query: "approved-" + fixture.Prefix})
	require.NoError(t, err)
	require.Len(t, search, 1)

	pending, _, err := ListPublicFiles(db, fixture.PublicA.ID, models.PublicFileQuery{Query: "pending-" + fixture.Prefix})
	require.NoError(t, err)
	assert.Empty(t, pending)
}

func TestGetPublicDownloadableFileEnforcesVisibility(t *testing.T) {
	db := newCatalogTestDB(t)
	fixture := newCatalogFixture(t, db)

	file, err := GetPublicDownloadableFile(db, fixture.Approved.ID)
	require.NoError(t, err)
	assert.Equal(t, fixture.Approved.ID, file.ID)

	for name, id := range map[string]uuid.UUID{
		"pending review": fixture.Pending.ID,
		"expired":        fixture.Expired.ID,
		"private bucket": fixture.PrivateFile.ID,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := GetPublicDownloadableFile(db, id)
			require.Error(t, err)

			var apiErr *apierrors.APIError
			require.True(t, errors.As(err, &apiErr))
			assert.Equal(t, apierrors.CodeFileNotFound, apiErr.Code)
		})
	}
}

func TestPublicBreadcrumbStopsAtRoot(t *testing.T) {
	db := newCatalogTestDB(t)
	fixture := newCatalogFixture(t, db)

	root := models.Folder{Name: "root-" + fixture.Prefix, Status: models.FolderStatusCreated, BucketID: fixture.PublicA.ID}
	require.NoError(t, db.Create(&root).Error)

	child := models.Folder{
		Name: "child-" + fixture.Prefix, Status: models.FolderStatusCreated,
		BucketID: fixture.PublicA.ID, FolderID: &root.ID,
	}
	require.NoError(t, db.Create(&child).Error)

	breadcrumb := PublicBreadcrumb(db, fixture.PublicA.ID, child.ID)
	require.Len(t, breadcrumb, 2)
	assert.Equal(t, root.ID, breadcrumb[0].ID)
	assert.Equal(t, child.ID, breadcrumb[1].ID)
}

func TestListPublicCategoriesCountsPublishedBuckets(t *testing.T) {
	db := newCatalogTestDB(t)
	fixture := newCatalogFixture(t, db)

	categories, err := ListPublicCategories(db)
	require.NoError(t, err)

	var found bool
	for _, category := range categories {
		if category.Category == fixture.Category {
			found = true
			assert.Equal(t, int64(2), category.BucketCount)
		}
	}
	assert.True(t, found, "category of the seeded buckets must be listed")
}
