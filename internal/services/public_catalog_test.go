package services

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/safebucket/safebucket/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type publicCatalogFixture struct {
	service   PublicCatalogService
	router    chi.Router
	publicID  uuid.UUID
	slug      string
	privateID uuid.UUID
	fileID    uuid.UUID
}

// newPublicCatalogFixture seeds a public and a private bucket plus one approved
// file, then mounts the real service router the way bootstrap does.
func newPublicCatalogFixture(t *testing.T) publicCatalogFixture {
	t.Helper()

	db := setupUserServiceTestDB(t)

	user := models.User{
		Email:        "catalog-routes@example.com",
		ProviderType: models.LocalProviderType,
		ProviderKey:  "catalog-routes",
		Role:         models.RoleUser,
	}
	require.NoError(t, db.Create(&user).Error)

	published := time.Now().UTC().Add(-time.Hour)
	slug := "routes-tools"
	category := "路由测试"
	privateSlug := "routes-private"

	publicBucket := models.Bucket{
		Name: "公开栏目", Description: "公开描述", CreatedBy: user.ID,
		IsPublic: true, Slug: &slug, Category: &category, PublishedAt: &published,
	}
	privateBucket := models.Bucket{
		Name: "私有栏目", CreatedBy: user.ID, IsPublic: false, Slug: &privateSlug,
	}
	require.NoError(t, db.Create(&publicBucket).Error)
	require.NoError(t, db.Create(&privateBucket).Error)

	file := models.File{
		Name: "教程.pdf", Extension: ".pdf",
		Status: models.FileStatusUploaded, ReviewStatus: models.ReviewStatusApproved,
		BucketID: publicBucket.ID,
	}
	require.NoError(t, db.Create(&file).Error)

	version := models.FileVersion{
		FileID: file.ID, Version: 1, Size: 2048, Status: models.FileStatusUploaded,
	}
	require.NoError(t, db.Create(&version).Error)
	require.NoError(t, db.Model(&models.File{}).
		Where("id = ?", file.ID).
		Update("current_version_id", version.ID).Error)

	enabled := PublicCatalogService{DB: db, Enabled: true}
	router := chi.NewRouter()
	router.Mount("/api/v1/public", enabled.Routes())

	return publicCatalogFixture{
		service:   enabled,
		router:    router,
		publicID:  publicBucket.ID,
		slug:      slug,
		privateID: privateBucket.ID,
		fileID:    file.ID,
	}
}

func doPublicRequest(t *testing.T, router chi.Router, path string) *httptest.ResponseRecorder {
	t.Helper()

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
	return recorder
}

func TestPublicCatalogRoutesAnonymous(t *testing.T) {
	fixture := newPublicCatalogFixture(t)

	t.Run("bucket index needs no credentials", func(t *testing.T) {
		recorder := doPublicRequest(t, fixture.router, "/api/v1/public/buckets")
		require.Equal(t, http.StatusOK, recorder.Code)

		var page models.Page[models.PublicBucketListItem]
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &page))
		require.Len(t, page.Data, 1)
		assert.Equal(t, fixture.publicID, page.Data[0].ID)
		assert.Equal(t, int64(1), page.Data[0].FileCount)
		assert.Equal(t, int64(2048), page.Data[0].TotalSize)
	})

	t.Run("private bucket is not addressable", func(t *testing.T) {
		recorder := doPublicRequest(t, fixture.router, "/api/v1/public/buckets/routes-private")
		assert.Equal(t, http.StatusNotFound, recorder.Code)
		assert.Contains(t, recorder.Body.String(), "BUCKET_NOT_PUBLIC")
	})

	t.Run("bucket detail by slug", func(t *testing.T) {
		recorder := doPublicRequest(t, fixture.router, "/api/v1/public/buckets/"+fixture.slug)
		require.Equal(t, http.StatusOK, recorder.Code)

		var bucket models.PublicBucketListItem
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &bucket))
		assert.Equal(t, fixture.publicID, bucket.ID)
		assert.Equal(t, "路由测试", *bucket.Category)
	})

	t.Run("file listing hides the storage key", func(t *testing.T) {
		recorder := doPublicRequest(t, fixture.router, "/api/v1/public/buckets/"+fixture.slug+"/files")
		require.Equal(t, http.StatusOK, recorder.Code)

		var listing models.PublicFileListing
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &listing))
		require.Len(t, listing.Files, 1)
		assert.Equal(t, fixture.fileID, listing.Files[0].ID)
		assert.Equal(t, int64(2048), listing.Files[0].Size)
		assert.NotContains(t, recorder.Body.String(), "bucket_id")
	})

	t.Run("categories", func(t *testing.T) {
		recorder := doPublicRequest(t, fixture.router, "/api/v1/public/categories")
		require.Equal(t, http.StatusOK, recorder.Code)
		assert.Contains(t, recorder.Body.String(), "路由测试")
	})

	t.Run("invalid limit is rejected", func(t *testing.T) {
		recorder := doPublicRequest(t, fixture.router, "/api/v1/public/buckets?limit=999")
		assert.Equal(t, http.StatusBadRequest, recorder.Code)
	})

	t.Run("malformed cursor is rejected", func(t *testing.T) {
		recorder := doPublicRequest(t, fixture.router, "/api/v1/public/buckets?cursor=broken")
		assert.Equal(t, http.StatusBadRequest, recorder.Code)
	})
}

func TestPublicCatalogDisabledReturns404(t *testing.T) {
	db := setupUserServiceTestDB(t)

	router := chi.NewRouter()
	router.Mount("/api/v1/public", PublicCatalogService{DB: db, Enabled: false}.Routes())

	recorder := doPublicRequest(t, router, "/api/v1/public/buckets")
	assert.Equal(t, http.StatusNotFound, recorder.Code)
}
