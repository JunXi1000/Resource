-- +goose Up
-- +goose StatementBegin

ALTER TABLE buckets ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0
    CHECK (is_public IN (0, 1));
ALTER TABLE buckets ADD COLUMN slug TEXT;
ALTER TABLE buckets ADD COLUMN category TEXT;
ALTER TABLE buckets ADD COLUMN published_at DATETIME;

-- partial unique index: private buckets all share a NULL slug
CREATE UNIQUE INDEX idx_buckets_slug ON buckets (slug) WHERE slug IS NOT NULL;

CREATE INDEX idx_buckets_public ON buckets (published_at DESC)
    WHERE is_public = 1 AND deleted_at IS NULL;

CREATE TABLE bucket_tags
    (
        bucket_id TEXT NOT NULL,
        tag TEXT NOT NULL,

        PRIMARY KEY (bucket_id, tag),

        CONSTRAINT fk_bucket_tags_bucket_id
            FOREIGN KEY (bucket_id) REFERENCES buckets (id) ON UPDATE CASCADE ON DELETE CASCADE
    );

CREATE INDEX idx_bucket_tags_tag ON bucket_tags (tag);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS bucket_tags;

DROP INDEX IF EXISTS idx_buckets_public;
DROP INDEX IF EXISTS idx_buckets_slug;

ALTER TABLE buckets DROP COLUMN published_at;
ALTER TABLE buckets DROP COLUMN category;
ALTER TABLE buckets DROP COLUMN slug;
ALTER TABLE buckets DROP COLUMN is_public;

-- +goose StatementEnd
