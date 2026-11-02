-- +goose Up
-- +goose StatementBegin

-- defaults to 'approved' so every pre-existing file stays visible and the
-- review workflow only affects new uploads into public buckets
ALTER TABLE files ADD COLUMN review_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (review_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE files ADD COLUMN reviewed_by TEXT;
ALTER TABLE files ADD COLUMN reviewed_at DATETIME;
ALTER TABLE files ADD COLUMN reject_reason TEXT;

-- NOTE: reviewed_by has no FOREIGN KEY here, see 00018 for the rationale.
CREATE INDEX idx_files_review ON files (review_status, bucket_id)
    WHERE deleted_at IS NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_files_review;

ALTER TABLE files DROP COLUMN reject_reason;
ALTER TABLE files DROP COLUMN reviewed_at;
ALTER TABLE files DROP COLUMN reviewed_by;
ALTER TABLE files DROP COLUMN review_status;

-- +goose StatementEnd
