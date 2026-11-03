package models

import (
	"time"

	"github.com/google/uuid"
)

// AdminReviewListQueryParams filters the review queue. Cursor pagination is
// shared with the other admin queues: keyset on (created_at, id), oldest
// first, so the longest-waiting upload is always the top row.
type AdminReviewListQueryParams struct {
	Status   string `json:"status"    validate:"omitempty,oneof=pending approved rejected"`
	BucketID string `json:"bucket_id" validate:"omitempty,uuid"`
	Cursor   string `json:"cursor"    validate:"omitempty,max=512"`
	Limit    int    `json:"limit"     validate:"omitempty,gte=1,lte=100"`
}

// AdminReviewItem is the review-queue projection of a file. The uploader is
// resolved from the current version so the operator can contact the person
// responsible for the content they are judging.
type AdminReviewItem struct {
	ID           uuid.UUID    `json:"id"`
	Name         string       `json:"name"`
	Extension    string       `json:"extension"`
	Size         int64        `json:"size"`
	ReviewStatus ReviewStatus `json:"review_status"`
	RejectReason *string      `json:"reject_reason,omitempty"`
	ReviewedAt   *time.Time   `json:"reviewed_at,omitempty"`
	BucketID     uuid.UUID    `json:"bucket_id"`
	BucketName   string       `json:"bucket_name"`
	Uploader     *UserInfo    `json:"uploader,omitempty"`
	CreatedAt    time.Time    `json:"created_at"`
}

// AdminReviewRejectBody records why a file was rejected. The uploader sees
// this text, so it must be an actual explanation, not a private note.
type AdminReviewRejectBody struct {
	Reason string `json:"reason" validate:"required,min=3,max=500"`
}
