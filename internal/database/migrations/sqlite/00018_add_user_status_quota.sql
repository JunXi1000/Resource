-- +goose Up
-- +goose StatementBegin

ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'suspended'));
ALTER TABLE users ADD COLUMN email_verified_at DATETIME;
ALTER TABLE users ADD COLUMN approved_by TEXT;
ALTER TABLE users ADD COLUMN approved_at DATETIME;
ALTER TABLE users ADD COLUMN quota_bytes INTEGER NOT NULL DEFAULT 21474836480;
ALTER TABLE users ADD COLUMN used_bytes INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_users_status ON users (status);

-- NOTE: SQLite cannot add a FOREIGN KEY through ALTER TABLE, and rebuilding the
-- whole users table just for a nullable audit column is not worth it.
-- approved_by is therefore unenforced on SQLite only; Postgres keeps the FK.

CREATE TABLE upload_reservations
    (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        bucket_id TEXT NOT NULL,
        version_id TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'reserved'
            CHECK (state IN ('reserved', 'settled', 'released')),
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT fk_upload_reservations_user_id
            FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_upload_reservations_bucket_id
            FOREIGN KEY (bucket_id) REFERENCES buckets (id) ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT chk_upload_reservations_bytes_non_negative
            CHECK (bytes >= 0)
    );

-- one reservation per upload version: retries must not double-charge
CREATE UNIQUE INDEX uq_upload_reservations_version_id ON upload_reservations (version_id);
CREATE INDEX idx_upload_reservations_reap ON upload_reservations (state, expires_at);
CREATE INDEX idx_upload_reservations_user_id ON upload_reservations (user_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS upload_reservations;

DROP INDEX IF EXISTS idx_users_status;

ALTER TABLE users DROP COLUMN used_bytes;
ALTER TABLE users DROP COLUMN quota_bytes;
ALTER TABLE users DROP COLUMN approved_at;
ALTER TABLE users DROP COLUMN approved_by;
ALTER TABLE users DROP COLUMN email_verified_at;
ALTER TABLE users DROP COLUMN status;

-- +goose StatementEnd
