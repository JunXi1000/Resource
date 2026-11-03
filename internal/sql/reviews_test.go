package sql

import (
	"testing"
	"time"

	"github.com/safebucket/safebucket/internal/models"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type reviewFixture struct {
	Owner      models.User
	Uploader   models.User
	Public     models.Bucket
	Private    models.Bucket
	PublicFile models.File
	PrivFile   models.File
}

func newReviewFixture(t *testing.T, db *gorm.DB) reviewFixture {
	t.Helper()

	provider := models.LocalProviderType
	fix := reviewFixture{
		Owner: models.User{
			Email: "owner-" + uuid.New().String() + "@example.com",
			ProviderType: provider, ProviderKey: "local", Role: models.RoleUser,
		},
		Uploader: models.User{
			Email: "uploader-" + uuid.New().String() + "@example.com",
			ProviderType: provider, ProviderKey: "local", Role: models.RoleUser,
		},
	}
	require.NoError(t, db.Create(&fix.Owner).Error)
	require.NoError(t, db.Create(&fix.Uploader).Error)

	fix.Public = models.Bucket{Name: "pub-" + uuid.New().String(), CreatedBy: fix.Owner.ID, IsPublic: true}
	require.NoError(t, db.Create(&fix.Public).Error)
	fix.Private = models.Bucket{Name: "priv-" + uuid.New().String(), CreatedBy: fix.Owner.ID}
	require.NoError(t, db.Create(&fix.Private).Error)

	require.NoError(t, db.Create(&models.Membership{
		UserID: fix.Owner.ID, BucketID: fix.Public.ID, Group: models.GroupOwner,
	}).Error)
	require.NoError(t, db.Create(&models.Membership{
		UserID: fix.Owner.ID, BucketID: fix.Private.ID, Group: models.GroupOwner,
	}).Error)

	newFile := func(bucket models.Bucket, name string) models.File {
		file := models.File{
			ID: uuid.New(), BucketID: bucket.ID, Name: name,
			Status: models.FileStatusUploaded, ReviewStatus: models.ReviewStatusApproved,
		}
		require.NoError(t, db.Create(&file).Error)
		version := models.FileVersion{
			ID: file.ID, FileID: file.ID, Version: 1,
			Size: 1024, Status: models.FileStatusUploaded, UploadedBy: &fix.Uploader.ID,
		}
		require.NoError(t, db.Create(&version).Error)
		require.NoError(t, db.Model(&file).Update("current_version_id", version.ID).Error)
		return file
	}

	fix.PublicFile = newFile(fix.Public, "public.bin")
	fix.PrivFile = newFile(fix.Private, "private.bin")
	return fix
}

func TestReviewFileTransitions(t *testing.T) {
	db := newCatalogTestDB(t)
	fix := newReviewFixture(t, db)

	reviewer := fix.Owner.ID

	// pending → approved
	approved := fix.PublicFile
	require.NoError(t, db.Model(&approved).Update("review_status", models.ReviewStatusPending).Error)
	var result models.File
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		var txErr error
		result, txErr = ReviewFile(tx, approved, true, reviewer, nil)
		return txErr
	}))
	assert.Equal(t, models.ReviewStatusApproved, result.ReviewStatus)
	require.NotNil(t, result.ReviewedBy)
	assert.Equal(t, reviewer, *result.ReviewedBy)
	require.Nil(t, result.RejectReason)

	// approved → rejected acts as takedown and keeps the reason.
	reason := "contains malware"
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		var txErr error
		result, txErr = ReviewFile(tx, result, false, reviewer, &reason)
		return txErr
	}))
	assert.Equal(t, models.ReviewStatusRejected, result.ReviewStatus)
	require.NotNil(t, result.RejectReason)
	assert.Equal(t, reason, *result.RejectReason)

	// rejected → approve is an invalid transition.
	require.Error(t, db.Transaction(func(tx *gorm.DB) error {
		_, txErr := ReviewFile(tx, result, true, reviewer, nil)
		return txErr
	}))

	// approve is idempotent on approved files.
	require.NoError(t, db.Model(&approved).Update("review_status", models.ReviewStatusApproved).Error)
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		_, txErr := ReviewFile(tx, approved, true, reviewer, nil)
		return txErr
	}))

	// reject is idempotent on rejected files.
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		_, txErr := ReviewFile(tx, result, false, reviewer, &reason)
		return txErr
	}))
}

func TestListFilesForReviewScope(t *testing.T) {
	db := newCatalogTestDB(t)
	fix := newReviewFixture(t, db)

	// Move the public file into the queue with a deterministically older
	// timestamp so ordering assertions hold.
	require.NoError(t, db.Model(&fix.PublicFile).Updates(map[string]interface{}{
		"review_status": models.ReviewStatusPending,
		"created_at":    time.Now().Add(-time.Hour),
	}).Error)

	// nil scope = platform admin: sees both buckets.
	items, _, err := ListFilesForReview(db, models.AdminReviewListQueryParams{Status: "pending"}, nil)
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, fix.PublicFile.ID, items[0].ID)
	assert.Equal(t, fix.Public.Name, items[0].BucketName)
	assert.Equal(t, int64(1024), items[0].Size)
	require.NotNil(t, items[0].Uploader)
	assert.Equal(t, fix.Uploader.ID, items[0].Uploader.ID)

	// Empty scope = non-admin owning nothing: sees nothing.
	items, _, err = ListFilesForReview(db, models.AdminReviewListQueryParams{}, []uuid.UUID{})
	require.NoError(t, err)
	assert.Empty(t, items)

	// Scope limited to the private bucket: the pending public file is out.
	// The owner's own approved private file is still listed, which is correct
	// — the queue also doubles as the bucket's moderation history.
	items, _, err = ListFilesForReview(db, models.AdminReviewListQueryParams{Status: "pending"}, []uuid.UUID{fix.Private.ID})
	require.NoError(t, err)
	assert.Empty(t, items)

	// Owned-public scope: sees the pending file.
	owned, err := OwnedPublicBucketIDs(db, fix.Owner.ID)
	require.NoError(t, err)
	assert.Equal(t, []uuid.UUID{fix.Public.ID}, owned)
	items, _, err = ListFilesForReview(db, models.AdminReviewListQueryParams{}, owned)
	require.NoError(t, err)
	require.Len(t, items, 1)

	// A user who is only a member (not owner) of the public bucket has no
	// moderation rights — contributors cannot review, per design §5.3.
	viewer := models.User{
		Email: "viewer-" + uuid.New().String() + "@example.com",
		ProviderType: models.LocalProviderType, ProviderKey: "local", Role: models.RoleUser,
	}
	require.NoError(t, db.Create(&viewer).Error)
	require.NoError(t, db.Create(&models.Membership{
		UserID: viewer.ID, BucketID: fix.Public.ID, Group: models.GroupContributor,
	}).Error)
	owner, err := IsPublicBucketOwner(db, viewer.ID, fix.Public.ID)
	require.NoError(t, err)
	assert.False(t, owner)
	owner, err = IsPublicBucketOwner(db, fix.Owner.ID, fix.Public.ID)
	require.NoError(t, err)
	assert.True(t, owner)
}

func TestUploadReviewStatusFollowsBucketVisibility(t *testing.T) {
	db := newCatalogTestDB(t)
	fix := newReviewFixture(t, db)

	uploader := fix.Uploader.ID

	// A brand-new upload into a public bucket enters the pending queue.
	body := models.FileUploadBody{Name: "upload.bin", Size: 2048}
	var publicFile models.File
	var publicVersion models.FileVersion
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		var txErr error
		publicFile, publicVersion, txErr = ReserveFileVersion(tx, fix.Public.ID, body, &uploader, nil)
		return txErr
	}))
	assert.Equal(t, models.ReviewStatusPending, publicFile.ReviewStatus)

	// Private buckets keep the historic behaviour: everything is approved.
	var privateFile models.File
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		var txErr error
		privateFile, _, txErr = ReserveFileVersion(tx, fix.Private.ID, body, &uploader, nil)
		return txErr
	}))
	assert.Equal(t, models.ReviewStatusApproved, privateFile.ReviewStatus)

	// Completing the first upload keeps the pending state (promotion must not
	// accidentally approve a public file).
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		return PromoteFileVersion(tx, publicFile, publicVersion, 3)
	}))
	var afterFirst models.File
	require.NoError(t, db.Where("id = ?", publicFile.ID).Find(&afterFirst).Error)
	assert.Equal(t, models.ReviewStatusPending, afterFirst.ReviewStatus)

	// Approve, then re-upload: the new version must send the file back to
	// pending — the reviewers approved the old bytes, not these ones.
	require.NoError(t, db.Model(&publicFile).Updates(map[string]interface{}{
		"review_status": models.ReviewStatusApproved,
		"reject_reason": nil,
	}).Error)

	retry := models.FileUploadBody{Name: "upload.bin", Size: 4096}
	var version2 models.FileVersion
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		var txErr error
		_, version2, txErr = ReserveFileVersion(tx, fix.Public.ID, retry, &uploader, nil)
		return txErr
	}))
	var refreshed models.File
	require.NoError(t, db.Where("id = ?", publicFile.ID).Find(&refreshed).Error)
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		return PromoteFileVersion(tx, refreshed, version2, 3)
	}))
	var afterReupload models.File
	require.NoError(t, db.Where("id = ?", publicFile.ID).Find(&afterReupload).Error)
	assert.Equal(t, models.ReviewStatusPending, afterReupload.ReviewStatus,
		"re-uploading into a public bucket must reset the review state")

	// The private file is untouched by promotions. Its first version must be
	// promoted first — a file with a version still uploading refuses new
	// uploads (FILE_UPLOAD_IN_PROGRESS).
	var privateVersion1 models.FileVersion
	require.NoError(t, db.Where("file_id = ? AND version = 1", privateFile.ID).Find(&privateVersion1).Error)
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		return PromoteFileVersion(tx, privateFile, privateVersion1, 3)
	}))
	var privateVersion2 models.FileVersion
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		var txErr error
		_, privateVersion2, txErr = ReserveFileVersion(tx, fix.Private.ID, retry, &uploader, nil)
		return txErr
	}))
	require.NoError(t, db.Where("id = ?", privateFile.ID).Find(&refreshed).Error)
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		return PromoteFileVersion(tx, refreshed, privateVersion2, 3)
	}))
	var privateAfter models.File
	require.NoError(t, db.Where("id = ?", privateFile.ID).Find(&privateAfter).Error)
	assert.Equal(t, models.ReviewStatusApproved, privateAfter.ReviewStatus)
}
