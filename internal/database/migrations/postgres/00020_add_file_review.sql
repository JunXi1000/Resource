-- +goose Up
-- +goose StatementBegin

CREATE TYPE file_review_status AS ENUM ('pending', 'approved', 'rejected');

-- defaults to 'approved' so every pre-existing file stays visible and the
-- review workflow only affects new uploads into public buckets
ALTER TABLE files ADD COLUMN review_status file_review_status NOT NULL DEFAULT 'approved';
ALTER TABLE files ADD COLUMN reviewed_by uuid;
ALTER TABLE files ADD COLUMN reviewed_at TIMESTAMP;
ALTER TABLE files ADD COLUMN reject_reason VARCHAR(500);

ALTER TABLE files
    ADD CONSTRAINT fk_files_reviewed_by
        FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX idx_files_review ON files (review_status, bucket_id)
    WHERE deleted_at IS NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_files_review;

ALTER TABLE files DROP CONSTRAINT IF EXISTS fk_files_reviewed_by;

ALTER TABLE files DROP COLUMN IF EXISTS reject_reason;
ALTER TABLE files DROP COLUMN IF EXISTS reviewed_at;
ALTER TABLE files DROP COLUMN IF EXISTS reviewed_by;
ALTER TABLE files DROP COLUMN IF EXISTS review_status;

DROP TYPE IF EXISTS file_review_status;

-- +goose StatementEnd
