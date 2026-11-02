package models

import (
	"time"

	"github.com/google/uuid"
)

// PublicBucketQuery is the query string accepted by GET /api/v1/public/buckets.
// Every field is optional; an empty query lists the most recently published
// buckets first.
type PublicBucketQuery struct {
	Query    string `json:"q"        validate:"omitempty,max=100"`
	Category string `json:"category" validate:"omitempty,max=50"`
	Tag      string `json:"tag"      validate:"omitempty,max=50"`
	Sort     string `json:"sort"     validate:"omitempty,oneof=recent name popular"`
	Cursor   string `json:"cursor"   validate:"omitempty,max=512"`
	Limit    int    `json:"limit"    validate:"omitempty,min=1,max=100"`
}

// PublicFileQuery is the query string accepted by
// GET /api/v1/public/buckets/{slug}/files. Folder is a folder id, not a path:
// the catalog is browsed one level at a time so that deep trees never require
// a full traversal for a single request.
type PublicFileQuery struct {
	Folder string `json:"folder" validate:"omitempty,uuid"`
	Query  string `json:"q"      validate:"omitempty,max=100"`
	Cursor string `json:"cursor" validate:"omitempty,max=512"`
	Limit  int    `json:"limit"  validate:"omitempty,min=1,max=100"`
}

// PublicFolderItem is the minimal folder projection exposed to anonymous
// visitors. Internal fields (owner, status, deleted_by) stay private.
type PublicFolderItem struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}

// PublicFileItem is the anonymous projection of a file. The storage object
// key, the owning bucket and the review metadata are deliberately omitted.
type PublicFileItem struct {
	ID        uuid.UUID  `json:"id"`
	Name      string     `json:"name"`
	Extension string     `json:"extension"`
	Size      int64      `json:"size"`
	FolderID  *uuid.UUID `json:"folder_id,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

// PublicFileListing is the response of the file browse endpoint. Folders and
// files are returned together because the anonymous UI renders them as one
// listing, and splitting them into two requests would double the latency of
// every folder navigation.
type PublicFileListing struct {
	Bucket     PublicBucketListItem `json:"bucket"`
	Folder     *PublicFolderItem    `json:"folder,omitempty"`
	Breadcrumb []PublicFolderItem   `json:"breadcrumb"`
	Folders    []PublicFolderItem   `json:"folders"`
	Files      []PublicFileItem     `json:"files"`
	NextCursor *string              `json:"next_cursor,omitempty"`
}

// PublicCategoryItem is one row of the category filter shown on the landing
// page. BucketCount lets the UI hide empty categories.
type PublicCategoryItem struct {
	Category    string `json:"category"`
	BucketCount int64  `json:"bucket_count"`
}

// PublicDownloadResponse carries a short-lived presigned URL. The URL points
// directly at the object storage endpoint; the API server never proxies bytes.
type PublicDownloadResponse struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	Size int64     `json:"size"`
	URL  string    `json:"url"`
}
