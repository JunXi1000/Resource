-- +goose Up
-- +goose StatementBegin

-- Self-service registration reuses the challenges table: the same hashed secret,
-- expiry and attempt-lockdown semantics apply to a signup code as to an invite.
ALTER TYPE challenge_type ADD VALUE IF NOT EXISTS 'registration';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- PostgreSQL cannot drop a single enum value, so the type has to be rebuilt.
-- Rows using it must be removed first or the cast below would fail.
DELETE FROM challenges WHERE type = 'registration';

CREATE TYPE challenge_type_old AS ENUM ('invite', 'password_reset', 'mfa_reset');
ALTER TABLE challenges ALTER COLUMN type TYPE challenge_type_old USING type::text::challenge_type_old;
DROP TYPE challenge_type;
ALTER TYPE challenge_type_old RENAME TO challenge_type;

-- +goose StatementEnd
