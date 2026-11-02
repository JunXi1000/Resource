package models

import (
	"time"

	"github.com/google/uuid"
)

// ReservationState tracks a quota reservation through its lifecycle.
type ReservationState string

const (
	// ReservationStateReserved means the bytes are held but the upload has
	// not completed yet. A reaper releases stale reservations.
	ReservationStateReserved ReservationState = "reserved"
	// ReservationStateSettled means the upload completed and the reserved
	// bytes were reconciled against the actual object size.
	ReservationStateSettled ReservationState = "settled"
	// ReservationStateReleased means the reservation was given back because
	// the upload failed, was aborted, or expired.
	ReservationStateReleased ReservationState = "released"
)

// ReservationTTL is how long an upload may stay incomplete before the reaper
// returns its bytes to the user's quota.
const ReservationTTL = 2 * time.Hour

// UploadReservation is a debit against a user's quota, created when a
// presigned upload URL is issued and settled when that upload completes.
//
// It exists because uploads bypass this server entirely: the browser PUTs
// straight into object storage, so the only moment we can enforce a quota is
// before signing the URL. Checking once without holding the bytes would let
// concurrent uploads oversell the quota.
type UploadReservation struct {
	ID        uuid.UUID        `gorm:"default:(-)"               json:"id"`
	UserID    uuid.UUID        `gorm:"not null"                  json:"user_id"`
	BucketID  uuid.UUID        `gorm:"not null"                  json:"bucket_id"`
	VersionID uuid.UUID        `gorm:"not null"                  json:"version_id"`
	Bytes     int64            `gorm:"not null"                  json:"bytes"`
	State     ReservationState `gorm:"not null;default:reserved" json:"state"`
	ExpiresAt time.Time        `gorm:"not null"                  json:"expires_at"`
	CreatedAt time.Time        `                                 json:"created_at"`
}

func (r *UploadReservation) IsOpen() bool {
	return r.State == ReservationStateReserved
}
