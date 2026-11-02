-- +goose Up
-- +goose StatementBegin

ALTER TABLE buckets ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE buckets ADD COLUMN slug TEXT;
ALTER TABLE buckets ADD COLUMN category VARCHAR(50);
ALTER TABLE buckets ADD COLUMN published_at TIMESTAMP;

-- partial unique index: private buckets all share a NULL slug, so a plain
-- unique index would still work on Postgres but the intent is clearer here
CREATE UNIQUE INDEX idx_buckets_slug ON buckets (slug) WHERE slug IS NOT NULL;

CREATE INDEX idx_buckets_public ON buckets (published_at DESC)
    WHERE is_public = TRUE AND deleted_at IS NULL;

CREATE TABLE bucket_tags
    (
        bucket_id uuid NOT NULL,
        tag VARCHAR(50) NOT NULL,

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

ALTER TABLE buckets DROP COLUMN IF EXISTS published_at;
ALTER TABLE buckets DROP COLUMN IF EXISTS category;
ALTER TABLE buckets DROP COLUMN IF EXISTS slug;
ALTER TABLE buckets DROP COLUMN IF EXISTS is_public;

-- +goose StatementEnd
