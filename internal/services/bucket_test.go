package services

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/safebucket/safebucket/internal/activity"
	apierrors "github.com/safebucket/safebucket/internal/errors"
	"github.com/safebucket/safebucket/internal/models"
	"github.com/safebucket/safebucket/internal/sql"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

func newBucketServiceTestFixture(t *testing.T) (BucketService, models.User) {
	t.Helper()

	db := setupUserServiceTestDB(t)
	user := models.User{
		Email:        "bucket-service@example.com",
		ProviderType: models.LocalProviderType,
		ProviderKey:  string(models.LocalProviderType),
		Role:         models.RoleUser,
	}
	require.NoError(t, db.Create(&user).Error)

	service := BucketService{DB: db, ActivityLogger: &MockActivityLogger{}}
	return service, user
}

func createTestBucket(
	t *testing.T,
	service BucketService,
	user models.User,
	body models.BucketCreateUpdateBody,
) models.Bucket {
	t.Helper()

	bucket, err := service.CreateBucket(
		zap.NewNop(),
		models.UserClaims{UserID: user.ID},
		uuid.UUIDs{},
		body,
	)
	require.NoError(t, err)

	return bucket
}

func clearOutbox(t *testing.T, db *gorm.DB) {
	t.Helper()

	require.NoError(t, db.Where("1 = 1").Delete(&models.Outbox{}).Error)
}

func loadQueuedActivities(t *testing.T, db *gorm.DB) []models.Activity {
	t.Helper()

	var rows []models.Outbox
	require.NoError(t, db.Find(&rows).Error)

	activities := make([]models.Activity, 0, len(rows))
	for _, row := range rows {
		require.Equal(t, models.OutboxTypeActivity, row.Type)

		var entry models.Activity
		require.NoError(t, json.Unmarshal([]byte(row.Payload), &entry))
		activities = append(activities, entry)
	}

	return activities
}

func TestCreateBucketWithDescription(t *testing.T) {
	service, user := newBucketServiceTestFixture(t)
	description := "Team documentation"

	bucket := createTestBucket(t, service, user, models.BucketCreateUpdateBody{
		Name:        "docs",
		Description: &description,
	})
	assert.Equal(t, "Team documentation", bucket.Description)

	var persisted models.Bucket
	require.NoError(t, service.DB.First(&persisted, "id = ?", bucket.ID).Error)
	assert.Equal(t, "Team documentation", persisted.Description)
}

func TestCreateBucketWithoutDescriptionDefaultsToEmpty(t *testing.T) {
	service, user := newBucketServiceTestFixture(t)

	bucket := createTestBucket(t, service, user, models.BucketCreateUpdateBody{Name: "docs"})
	assert.Empty(t, bucket.Description)

	var persisted models.Bucket
	require.NoError(t, service.DB.First(&persisted, "id = ?", bucket.ID).Error)
	assert.Empty(t, persisted.Description)
}

func TestUpdateBucketUpdatesNameAndDescription(t *testing.T) {
	service, user := newBucketServiceTestFixture(t)
	bucket := createTestBucket(t, service, user, models.BucketCreateUpdateBody{Name: "docs"})
	clearOutbox(t, service.DB)

	description := "Updated description"
	err := service.UpdateBucket(
		zap.NewNop(),
		models.UserClaims{UserID: user.ID},
		uuid.UUIDs{bucket.ID},
		models.BucketCreateUpdateBody{Name: "docs-renamed", Description: &description},
	)
	require.NoError(t, err)

	var persisted models.Bucket
	require.NoError(t, service.DB.First(&persisted, "id = ?", bucket.ID).Error)
	assert.Equal(t, "docs-renamed", persisted.Name)
	assert.Equal(t, "Updated description", persisted.Description)

	queued := loadQueuedActivities(t, service.DB)
	require.Len(t, queued, 1)
	assert.Equal(t, activity.BucketUpdated, queued[0].Message)
}

func TestUpdateBucketKeepsDescriptionWhenOmitted(t *testing.T) {
	service, user := newBucketServiceTestFixture(t)
	description := "Keep me"
	bucket := createTestBucket(t, service, user, models.BucketCreateUpdateBody{
		Name:        "docs",
		Description: &description,
	})
	clearOutbox(t, service.DB)

	err := service.UpdateBucket(
		zap.NewNop(),
		models.UserClaims{UserID: user.ID},
		uuid.UUIDs{bucket.ID},
		models.BucketCreateUpdateBody{Name: "docs-renamed"},
	)
	require.NoError(t, err)

	var persisted models.Bucket
	require.NoError(t, service.DB.First(&persisted, "id = ?", bucket.ID).Error)
	assert.Equal(t, "docs-renamed", persisted.Name)
	assert.Equal(t, "Keep me", persisted.Description)

	queued := loadQueuedActivities(t, service.DB)
	require.Len(t, queued, 1)
	assert.Equal(t, activity.BucketUpdated, queued[0].Message)
}

func TestUpdateBucketClearsDescription(t *testing.T) {
	service, user := newBucketServiceTestFixture(t)
	description := "To be removed"
	bucket := createTestBucket(t, service, user, models.BucketCreateUpdateBody{
		Name:        "docs",
		Description: &description,
	})
	clearOutbox(t, service.DB)

	empty := ""
	err := service.UpdateBucket(
		zap.NewNop(),
		models.UserClaims{UserID: user.ID},
		uuid.UUIDs{bucket.ID},
		models.BucketCreateUpdateBody{Name: "docs", Description: &empty},
	)
	require.NoError(t, err)

	var persisted models.Bucket
	require.NoError(t, service.DB.First(&persisted, "id = ?", bucket.ID).Error)
	assert.Empty(t, persisted.Description)

	queued := loadQueuedActivities(t, service.DB)
	require.Len(t, queued, 1)
	assert.Equal(t, activity.BucketUpdated, queued[0].Message)
}

func TestUpdateBucketDescriptionOnlyLogsBucketUpdatedActivity(t *testing.T) {
	service, user := newBucketServiceTestFixture(t)
	description := "Old description"
	bucket := createTestBucket(t, service, user, models.BucketCreateUpdateBody{
		Name:        "docs",
		Description: &description,
	})
	clearOutbox(t, service.DB)

	updated := "New description"
	err := service.UpdateBucket(
		zap.NewNop(),
		models.UserClaims{UserID: user.ID},
		uuid.UUIDs{bucket.ID},
		models.BucketCreateUpdateBody{Name: "docs", Description: &updated},
	)
	require.NoError(t, err)

	queued := loadQueuedActivities(t, service.DB)
	require.Len(t, queued, 1)
	assert.Equal(t, activity.BucketUpdated, queued[0].Message)
	assert.Equal(t, bucket.ID.String(), queued[0].Filter.Fields.BucketID)

	object, ok := queued[0].Object.(map[string]any)
	require.True(t, ok)
	assert.Equal(t, bucket.ID.String(), object["id"])
	assert.Equal(t, "docs", object["name"])
}

// publishBody builds the minimal "make this bucket public" payload.
func publishBody(name, slug string) models.BucketCreateUpdateBody {
	public := true
	return models.BucketCreateUpdateBody{Name: name, IsPublic: &public, Slug: &slug}
}

func TestUpdateBucketPublishesAndAppearsInPublicCatalog(t *testing.T) {
	service, user := newBucketServiceTestFixture(t)
	bucket := createTestBucket(t, service, user, models.BucketCreateUpdateBody{Name: "team docs"})

	err := service.UpdateBucket(
		zap.NewNop(),
		models.UserClaims{UserID: user.ID},
		uuid.UUIDs{bucket.ID},
		publishBody("team docs", "team-docs"),
	)
	require.NoError(t, err)

	var persisted models.Bucket
	require.NoError(t, service.DB.First(&persisted, "id = ?", bucket.ID).Error)
	assert.True(t, persisted.IsPublic)
	require.NotNil(t, persisted.Slug)
	assert.Equal(t, "team-docs", *persisted.Slug)
	assert.NotNil(t, persisted.PublishedAt)

	// The point of the write path: what gets written is what the anonymous
	// catalog can read.
	items, _, listErr := sql.ListPublicBuckets(service.DB, models.PublicBucketQuery{})
	require.NoError(t, listErr)
	require.Len(t, items, 1)
	assert.Equal(t, "team-docs", *items[0].Slug)
}

func TestUpdateBucketDerivesSlugFromNameWhenPublishing(t *testing.T) {
	service, user := newBucketServiceTestFixture(t)
	bucket := createTestBucket(t, service, user, models.BucketCreateUpdateBody{Name: "Team Docs (EU)"})
	clearOutbox(t, service.DB)

	public := true
	err := service.UpdateBucket(
		zap.NewNop(),
		models.UserClaims{UserID: user.ID},
		uuid.UUIDs{bucket.ID},
		models.BucketCreateUpdateBody{Name: "Team Docs (EU)", IsPublic: &public},
	)
	require.NoError(t, err)

	var persisted models.Bucket
	require.NoError(t, service.DB.First(&persisted, "id = ?", bucket.ID).Error)
	require.NotNil(t, persisted.Slug)
	assert.Equal(t, "team-docs-eu", *persisted.Slug)
}

func TestUpdateBucketRejectsPublishWithoutUsableSlug(t *testing.T) {
	service, user := newBucketServiceTestFixture(t)
	bucket := createTestBucket(t, service, user, models.BucketCreateUpdateBody{Name: "文档"})

	public := true
	err := service.UpdateBucket(
		zap.NewNop(),
		models.UserClaims{UserID: user.ID},
		uuid.UUIDs{bucket.ID},
		models.BucketCreateUpdateBody{Name: "文档", IsPublic: &public},
	)

	var apiErr *apierrors.APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, http.StatusBadRequest, apiErr.Status)
	assert.Equal(t, apierrors.CodeInvalidSlug, apiErr.Code)

	var persisted models.Bucket
	require.NoError(t, service.DB.First(&persisted, "id = ?", bucket.ID).Error)
	assert.False(t, persisted.IsPublic, "a failed publish must not half-apply")
}

func TestUpdateBucketRejectsDuplicateSlug(t *testing.T) {
	service, user := newBucketServiceTestFixture(t)
	first := createTestBucket(t, service, user, models.BucketCreateUpdateBody{Name: "first"})
	second := createTestBucket(t, service, user, models.BucketCreateUpdateBody{Name: "second"})

	require.NoError(t, service.UpdateBucket(
		zap.NewNop(),
		models.UserClaims{UserID: user.ID},
		uuid.UUIDs{first.ID},
		publishBody("first", "shared-slug"),
	))

	err := service.UpdateBucket(
		zap.NewNop(),
		models.UserClaims{UserID: user.ID},
		uuid.UUIDs{second.ID},
		publishBody("second", "SHARED-SLUG"),
	)

	var apiErr *apierrors.APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, http.StatusConflict, apiErr.Status)
	assert.Equal(t, apierrors.CodeSlugTaken, apiErr.Code)
}

func TestUpdateBucketAllowsItsOwnSlugOnRename(t *testing.T) {
	service, user := newBucketServiceTestFixture(t)
	bucket := createTestBucket(t, service, user, models.BucketCreateUpdateBody{Name: "docs"})

	require.NoError(t, service.UpdateBucket(
		zap.NewNop(),
		models.UserClaims{UserID: user.ID},
		uuid.UUIDs{bucket.ID},
		publishBody("docs", "docs"),
	))

	// Re-saving the same slug (e.g. while editing the description) must not
	// conflict with itself.
	require.NoError(t, service.UpdateBucket(
		zap.NewNop(),
		models.UserClaims{UserID: user.ID},
		uuid.UUIDs{bucket.ID},
		publishBody("docs", "docs"),
	))
}

func TestUpdateBucketReplacesTags(t *testing.T) {
	service, user := newBucketServiceTestFixture(t)
	bucket := createTestBucket(t, service, user, models.BucketCreateUpdateBody{Name: "docs"})

	category := "documents"
	body := publishBody("docs", "docs")
	body.Tags = []string{"manual", "manual", " tutorial ", ""}
	body.Category = &category

	require.NoError(t, service.UpdateBucket(
		zap.NewNop(),
		models.UserClaims{UserID: user.ID},
		uuid.UUIDs{bucket.ID},
		body,
	))

	var tags []models.BucketTag
	require.NoError(t, service.DB.Where("bucket_id = ?", bucket.ID).Find(&tags).Error)
	require.Len(t, tags, 2, "duplicates, blanks and padding must be normalised away")

	values := []string{tags[0].Tag, tags[1].Tag}
	assert.ElementsMatch(t, []string{"manual", "tutorial"}, values)

	// A second update replaces the set instead of appending to it.
	body.Tags = []string{"release"}
	require.NoError(t, service.UpdateBucket(
		zap.NewNop(),
		models.UserClaims{UserID: user.ID},
		uuid.UUIDs{bucket.ID},
		body,
	))

	tags = nil
	require.NoError(t, service.DB.Where("bucket_id = ?", bucket.ID).Find(&tags).Error)
	require.Len(t, tags, 1)
	assert.Equal(t, "release", tags[0].Tag)
}

func TestUpdateBucketUnpublishRemovesFromCatalog(t *testing.T) {
	service, user := newBucketServiceTestFixture(t)
	bucket := createTestBucket(t, service, user, models.BucketCreateUpdateBody{Name: "docs"})

	require.NoError(t, service.UpdateBucket(
		zap.NewNop(),
		models.UserClaims{UserID: user.ID},
		uuid.UUIDs{bucket.ID},
		publishBody("docs", "docs"),
	))

	items, _, err := sql.ListPublicBuckets(service.DB, models.PublicBucketQuery{})
	require.NoError(t, err)
	require.Len(t, items, 1)

	hidden := false
	require.NoError(t, service.UpdateBucket(
		zap.NewNop(),
		models.UserClaims{UserID: user.ID},
		uuid.UUIDs{bucket.ID},
		models.BucketCreateUpdateBody{Name: "docs", IsPublic: &hidden},
	))

	items, _, err = sql.ListPublicBuckets(service.DB, models.PublicBucketQuery{})
	require.NoError(t, err)
	assert.Empty(t, items)

	var persisted models.Bucket
	require.NoError(t, service.DB.First(&persisted, "id = ?", bucket.ID).Error)
	assert.False(t, persisted.IsPublic)
	require.NotNil(t, persisted.Slug, "the slug is kept so republishing is one toggle")
}
