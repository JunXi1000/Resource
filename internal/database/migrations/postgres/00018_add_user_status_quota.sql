-- +goose Up
-- +goose StatementBegin

CREATE TYPE user_status AS ENUM ('pending', 'active', 'suspended');

ALTER TABLE users ADD COLUMN status user_status NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP;
ALTER TABLE users ADD COLUMN approved_by uuid;
ALTER TABLE users ADD COLUMN approved_at TIMESTAMP;
ALTER TABLE users ADD COLUMN quota_bytes BIGINT NOT NULL DEFAULT 21474836480;
ALTER TABLE users ADD COLUMN used_bytes BIGINT NOT NULL DEFAULT 0;

ALTER TABLE users
    ADD CONSTRAINT fk_users_approved_by
        FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE users
    ADD CONSTRAINT chk_users_quota_bytes_non_negative
        CHECK (quota_bytes >= 0);

ALTER TABLE users
    ADD CONSTRAINT chk_users_used_bytes_non_negative
        CHECK (used_bytes >= 0);

CREATE INDEX idx_users_status ON users (status);

CREATE TABLE upload_reservations
    (
        id uuid
            PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        bucket_id uuid NOT NULL,
        version_id uuid NOT NULL,
        bytes BIGINT NOT NULL,
        state VARCHAR(20) NOT NULL DEFAULT 'reserved',
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT fk_upload_reservations_user_id
            FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_upload_reservations_bucket_id
            FOREIGN KEY (bucket_id) REFERENCES buckets (id) ON UPDATE CASCADE ON DELETE CASCADE,

        -- one reservation per upload version: retries must not double-charge
        CONSTRAINT uq_upload_reservations_version_id UNIQUE (version_id),

        CONSTRAINT chk_upload_reservations_bytes_non_negative
            CHECK (bytes >= 0),
        CONSTRAINT chk_upload_reservations_state
            CHECK (state IN ('reserved', 'settled', 'released'))
    );

CREATE INDEX idx_upload_reservations_reap ON upload_reservations (state, expires_at);
CREATE INDEX idx_upload_reservations_user_id ON upload_reservations (user_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS upload_reservations;

DROP INDEX IF EXISTS idx_users_status;

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_used_bytes_non_negative;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_quota_bytes_non_negative;
ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_approved_by;

ALTER TABLE users DROP COLUMN IF EXISTS used_bytes;
ALTER TABLE users DROP COLUMN IF EXISTS quota_bytes;
ALTER TABLE users DROP COLUMN IF EXISTS approved_at;
ALTER TABLE users DROP COLUMN IF EXISTS approved_by;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;
ALTER TABLE users DROP COLUMN IF EXISTS status;

DROP TYPE IF EXISTS user_status;

-- +goose StatementEnd
