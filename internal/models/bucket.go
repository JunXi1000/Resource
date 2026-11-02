package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Bucket struct {
	ID          uuid.UUID `gorm:"default:(-)"           json:"id"`
	Name        string    `gorm:"not null;default:null" json:"name"        validate:"required"`
	Description string    `gorm:"not null;default:''"   json:"description"`
	IsPublic    bool      `gorm:"not null;default:false" json:"is_public"`
	// Slug is the public URL segment (/b/{slug}). NULL for private buckets,
	// enforced by the partial unique index idx_buckets_slug.
	Slug        *string        `gorm:"default:null"          json:"slug,omitempty"`
	Category    *string        `gorm:"default:null"          json:"category,omitempty"`
	PublishedAt *time.Time     `gorm:"default:null"          json:"published_at,omitempty"`
	Tags        []BucketTag    `gorm:"foreignKey:BucketID"   json:"tags,omitempty"`
	Files       []File         `                             json:"files"`
	Folders     []Folder       `                             json:"folders"`
	CreatedAt   time.Time      `                             json:"created_at"`
	CreatedBy   uuid.UUID      `gorm:"not null"              json:"-"`
	UpdatedAt   time.Time      `                             json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index"                 json:"deleted_at"`
}

type BucketActivity struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}

func (b *Bucket) ToActivity() BucketActivity {
	return BucketActivity{
		ID:   b.ID,
		Name: b.Name,
	}
}

type BucketCreateUpdateBody struct {
	Name        string   `json:"name"        validate:"required,max=100"`
	Description *string  `json:"description" validate:"omitempty,max=1000"`
	IsPublic    *bool    `json:"is_public"   validate:"omitempty"`
	Slug        *string  `json:"slug"        validate:"omitempty,min=3,max=120,slug"`
	Category    *string  `json:"category"    validate:"omitempty,max=50"`
	Tags        []string `json:"tags"        validate:"omitempty,max=20,dive,min=1,max=50"`
}

// BucketTag is a catalog label attached to a bucket. The composite primary
// key prevents duplicate tags per bucket without a surrogate id.
type BucketTag struct {
	BucketID uuid.UUID `gorm:"primaryKey"      json:"-"`
	Tag      string    `gorm:"primaryKey;size:50" json:"tag"`
}

// PublicBucketListItem is the anonymous catalog projection of a bucket.
// It deliberately omits anything that reveals internal structure.
type PublicBucketListItem struct {
	ID          uuid.UUID  `json:"id"`
	Slug        *string    `json:"slug"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Category    *string    `json:"category,omitempty"`
	Tags        []string   `json:"tags"`
	FileCount   int64      `json:"file_count"`
	TotalSize   int64      `json:"total_size"`
	PublishedAt *time.Time `json:"published_at,omitempty"`
}

type BucketTrashBody struct {
	FolderIDs []uuid.UUID `json:"folder_ids" validate:"omitempty,max=100,dive,uuid"`
	FileIDs   []uuid.UUID `json:"file_ids"   validate:"omitempty,max=100,dive,uuid"`
}

type AdminBucketListItem struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	Creator     UserInfo  `json:"creator"`
	MemberCount int64     `json:"member_count"`
	FileCount   int64     `json:"file_count"`
	Size        int64     `json:"size"`
}
