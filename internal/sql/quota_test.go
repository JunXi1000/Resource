package sql

import (
	"sync"
	"testing"
	"time"

	apierrors "github.com/safebucket/safebucket/internal/errors"
	"github.com/safebucket/safebucket/internal/models"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type quotaFixture struct {
	User      models.User
	QuotaUser models.User // 10 MiB quota
	Bucket    models.Bucket
}

const quotaTestBytes = 10 * 1024 * 1024

func newQuotaFixture(t *testing.T, db *gorm.DB) quotaFixture {
	t.Helper()

	provider := models.LocalProviderType
	fix := quotaFixture{}

	fix.User = models.User{
		Email:        "quota-" + uuid.New().String() + "@example.com",
		ProviderType: provider,
		ProviderKey:  "local",
		Role:         models.RoleUser,
	}
	require.NoError(t, db.Create(&fix.User).Error)
	// quota_bytes = 0 (unlimited) is unreachable through Create: the gorm
	// default tag omits zero values, so the column default (20 GiB) applies.
	// It can only be set explicitly after the row exists.
	require.NoError(t, db.Model(&models.User{}).Where("id = ?", fix.User.ID).
		UpdateColumn("quota_bytes", 0).Error)

	fix.QuotaUser = models.User{
		Email:        "quota-limited-" + uuid.New().String() + "@example.com",
		ProviderType: provider,
		ProviderKey:  "local",
		Role:         models.RoleUser,
		QuotaBytes:   quotaTestBytes,
	}
	require.NoError(t, db.Create(&fix.QuotaUser).Error)

	fix.Bucket = models.Bucket{Name: "quota-" + uuid.New().String(), CreatedBy: fix.User.ID}
	require.NoError(t, db.Create(&fix.Bucket).Error)

	return fix
}

func usedBytes(t *testing.T, db *gorm.DB, userID uuid.UUID) int64 {
	t.Helper()
	var used int64
	require.NoError(t, db.Model(&models.User{}).Where("id = ?", userID).
		Select("COALESCE(used_bytes, 0)").Scan(&used).Error)
	return used
}

func createReservation(t *testing.T, db *gorm.DB, userID, bucketID, versionID uuid.UUID, bytes int64, expires time.Time) models.UploadReservation {
	t.Helper()
	reservation := models.UploadReservation{
		UserID: userID, BucketID: bucketID, VersionID: versionID,
		Bytes: bytes, ExpiresAt: expires,
	}
	require.NoError(t, db.Create(&reservation).Error)
	return reservation
}

func TestReserveQuotaEnforcesLimit(t *testing.T) {
	db := newCatalogTestDB(t)
	fix := newQuotaFixture(t, db)

	// 6 MiB fits inside the 10 MiB quota.
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		return ReserveQuota(tx, fix.QuotaUser.ID, 6*1024*1024)
	}))
	assert.Equal(t, int64(6*1024*1024), usedBytes(t, db, fix.QuotaUser.ID))

	// A second 6 MiB upload must be refused atomically: 12 > 10.
	err := db.Transaction(func(tx *gorm.DB) error {
		return ReserveQuota(tx, fix.QuotaUser.ID, 6*1024*1024)
	})
	var apiErr *apierrors.APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, 413, apiErr.Status)
	assert.Equal(t, apierrors.CodeQuotaExceeded, apiErr.Code)

	// The refused reservation left no trace.
	assert.Equal(t, int64(6*1024*1024), usedBytes(t, db, fix.QuotaUser.ID))

	// quota_bytes = 0 means unlimited: the other user can go wild.
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		return ReserveQuota(tx, fix.User.ID, 999*1024*1024)
	}))
	assert.Equal(t, int64(999*1024*1024), usedBytes(t, db, fix.User.ID))
}

func TestReservationLifecycle(t *testing.T) {
	db := newCatalogTestDB(t)
	fix := newQuotaFixture(t, db)
	versionID := uuid.New()

	// Reserve 6 MiB, settle at an actual size of 5 MiB: the 1 MiB over-hold
	// goes back to the user.
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		if err := ReserveQuota(tx, fix.QuotaUser.ID, 6*1024*1024); err != nil {
			return err
		}
		return tx.Create(&models.UploadReservation{
			UserID: fix.QuotaUser.ID, BucketID: fix.Bucket.ID, VersionID: versionID,
			Bytes: 6 * 1024 * 1024, ExpiresAt: time.Now().Add(time.Hour),
		}).Error
	}))

	reservation, err := GetOpenReservation(db, versionID)
	require.NoError(t, err)
	require.NotNil(t, reservation)

	version := models.FileVersion{ID: versionID, Size: 5 * 1024 * 1024, UploadedBy: &fix.QuotaUser.ID}
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		return SettleUploadQuota(tx, version, nil)
	}))

	assert.Equal(t, int64(5*1024*1024), usedBytes(t, db, fix.QuotaUser.ID))

	open, err := GetOpenReservation(db, versionID)
	require.NoError(t, err)
	assert.Nil(t, open, "settled reservation must no longer be open")

	// Releasing a settled reservation is a no-op: no double refund.
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		return ReleaseReservation(tx, versionID)
	}))
	assert.Equal(t, int64(5*1024*1024), usedBytes(t, db, fix.QuotaUser.ID))
}

func TestReleaseReservationReturnsBytes(t *testing.T) {
	db := newCatalogTestDB(t)
	fix := newQuotaFixture(t, db)
	versionID := uuid.New()

	createReservation(t, db, fix.QuotaUser.ID, fix.Bucket.ID, versionID,
		6*1024*1024, time.Now().Add(time.Hour))
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		return ReserveQuota(tx, fix.QuotaUser.ID, 6*1024*1024)
	}))

	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		return ReleaseReservation(tx, versionID)
	}))
	assert.Equal(t, int64(0), usedBytes(t, db, fix.QuotaUser.ID))

	// Idempotent: releasing again must not go negative.
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		return ReleaseReservation(tx, versionID)
	}))
	assert.Equal(t, int64(0), usedBytes(t, db, fix.QuotaUser.ID))
}

func TestReapExpiredReservations(t *testing.T) {
	db := newCatalogTestDB(t)
	fix := newQuotaFixture(t, db)

	expired := createReservation(t, db, fix.QuotaUser.ID, fix.Bucket.ID, uuid.New(),
		4*1024*1024, time.Now().Add(-time.Minute))
	fresh := createReservation(t, db, fix.QuotaUser.ID, fix.Bucket.ID, uuid.New(),
		3*1024*1024, time.Now().Add(time.Hour))
	// The counter reflects both holds plus a settled remainder.
	require.NoError(t, db.Model(&models.User{}).Where("id = ?", fix.QuotaUser.ID).
		UpdateColumn("used_bytes", 7*1024*1024).Error)

	released, err := ReapExpiredReservations(db, time.Now(), 100)
	require.NoError(t, err)
	assert.Equal(t, int64(1), released)

	// NB: separate destinations. Reusing one struct would let GORM inject the
	// previous row's primary key as an implicit condition and silently match
	// nothing, keeping the stale scan values.
	var reaped models.UploadReservation
	require.NoError(t, db.Where("id = ?", expired.ID).Find(&reaped).Error)
	assert.Equal(t, models.ReservationStateReleased, reaped.State)

	var surviving models.UploadReservation
	require.NoError(t, db.Where("id = ?", fresh.ID).Find(&surviving).Error)
	assert.Equal(t, models.ReservationStateReserved, surviving.State, "unexpired hold must survive")

	// 7 - 4 = 3 MiB left.
	assert.Equal(t, int64(3*1024*1024), usedBytes(t, db, fix.QuotaUser.ID))
}

func TestGetUserUsage(t *testing.T) {
	db := newCatalogTestDB(t)
	fix := newQuotaFixture(t, db)

	createReservation(t, db, fix.QuotaUser.ID, fix.Bucket.ID, uuid.New(),
		1*1024*1024, time.Now().Add(time.Hour))
	require.NoError(t, db.Model(&models.User{}).Where("id = ?", fix.QuotaUser.ID).
		UpdateColumn("used_bytes", 2*1024*1024).Error)

	usage, err := GetUserUsage(db, fix.QuotaUser.ID)
	require.NoError(t, err)
	assert.Equal(t, int64(quotaTestBytes), usage.QuotaBytes)
	assert.Equal(t, int64(2*1024*1024), usage.UsedBytes)
	assert.Equal(t, int64(1*1024*1024), usage.ReservedBytes)
	assert.InDelta(t, 20.0, usage.Percent, 0.01)

	// Unlimited quota reports zero percent, never a division by zero.
	usage, err = GetUserUsage(db, fix.User.ID)
	require.NoError(t, err)
	assert.Equal(t, int64(0), usage.QuotaBytes)
	assert.Equal(t, 0.0, usage.Percent)
}

func TestTrashRefundAndRestoreCharge(t *testing.T) {
	db := newCatalogTestDB(t)
	fix := newQuotaFixture(t, db)

	file := models.File{
		ID: uuid.New(), BucketID: fix.Bucket.ID, Name: "refund.bin",
		Status: models.FileStatusUploaded, ReviewStatus: models.ReviewStatusApproved,
	}
	require.NoError(t, db.Create(&file).Error)
	version := models.FileVersion{
		ID: file.ID, FileID: file.ID, Version: 1,
		Size: 4 * 1024 * 1024, Status: models.FileStatusUploaded, UploadedBy: &fix.QuotaUser.ID,
	}
	require.NoError(t, db.Create(&version).Error)
	require.NoError(t, db.Model(&file).Update("current_version_id", version.ID).Error)
	require.NoError(t, db.Model(&models.User{}).Where("id = ?", fix.QuotaUser.ID).
		UpdateColumn("used_bytes", 4*1024*1024).Error)

	// Trashing refunds the uploader.
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		return RefundTrashedFiles(tx, fix.Bucket.ID, nil, uuid.UUIDs{file.ID})
	}))
	assert.Equal(t, int64(0), usedBytes(t, db, fix.QuotaUser.ID))

	// Restoring re-charges, even past the quota: restore never fails on quota.
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		return ChargeRestoredFile(tx, file)
	}))
	assert.Equal(t, int64(4*1024*1024), usedBytes(t, db, fix.QuotaUser.ID))
}

// TestConcurrentReservationsNoOversell is the acceptance test from the design
// doc (§7): a 10 MiB quota hit by two concurrent 6 MiB uploads yields exactly
// one winner. SQLite's single writer would serialise the same way, but only
// PostgreSQL's row locking proves the SQL is genuinely atomic, so this runs
// exclusively against TEST_POSTGRES_DSN.
func TestConcurrentReservationsNoOversell(t *testing.T) {
	db := newCatalogTestDB(t)
	if db.Dialector.Name() != "postgres" {
		t.Skip("concurrency proof requires PostgreSQL (set TEST_POSTGRES_DSN)")
	}

	fix := newQuotaFixture(t, db)
	var mu sync.Mutex
	winners, losers := 0, 0
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := db.Transaction(func(tx *gorm.DB) error {
				if err := ReserveQuota(tx, fix.QuotaUser.ID, 6*1024*1024); err != nil {
					return err
				}
				return tx.Create(&models.UploadReservation{
					UserID: fix.QuotaUser.ID, BucketID: fix.Bucket.ID, VersionID: uuid.New(),
					Bytes: 6 * 1024 * 1024, ExpiresAt: time.Now().Add(time.Hour),
				}).Error
			})
			mu.Lock()
			if err == nil {
				winners++
			} else {
				losers++
			}
			mu.Unlock()
		}()
	}
	wg.Wait()

	assert.Equal(t, 1, winners, "exactly one concurrent upload may win the quota")
	assert.Equal(t, 1, losers)
	assert.Equal(t, int64(6*1024*1024), usedBytes(t, db, fix.QuotaUser.ID))
}
