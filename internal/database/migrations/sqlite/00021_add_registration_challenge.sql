-- +goose Up
-- +goose NO TRANSACTION

-- 00010_drop_enum_checks removed every CHECK constraint on challenges.type, which
-- means SQLite would accept any string there. This migration restores the
-- constraint and adds the new 'registration' value, so both database engines
-- enforce the same set of challenge types again.
PRAGMA foreign_keys=OFF;

CREATE TABLE challenges_new
    (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('invite', 'password_reset', 'mfa_reset', 'registration')),
        hashed_secret TEXT NOT NULL,
        attempts_left INTEGER NOT NULL DEFAULT 3,
        expires_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        invite_id TEXT,
        user_id TEXT,

        CONSTRAINT fk_challenges_invite_id
            FOREIGN KEY (invite_id) REFERENCES invites (id) ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_challenges_user_id
            FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,

        CONSTRAINT chk_challenges_attempts_left
            CHECK (attempts_left >= 0),
        CONSTRAINT chk_challenges_mutual_exclusive
            CHECK ( (invite_id IS NOT NULL AND user_id IS NULL) OR (invite_id IS NULL AND user_id IS NOT NULL) )
    );

INSERT INTO challenges_new (id, type, hashed_secret, attempts_left, expires_at,
    created_at, deleted_at, invite_id, user_id)
SELECT id, type, hashed_secret, attempts_left, expires_at,
    created_at, deleted_at, invite_id, user_id FROM challenges;

DROP TABLE challenges;
ALTER TABLE challenges_new RENAME TO challenges;

CREATE INDEX idx_challenges_expires_at ON challenges (expires_at);
CREATE UNIQUE INDEX idx_challenge_invite ON challenges (invite_id) WHERE invite_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_challenge_user ON challenges (user_id) WHERE user_id IS NOT NULL AND deleted_at IS NULL;

PRAGMA foreign_keys=ON;

-- +goose Down
-- +goose NO TRANSACTION

PRAGMA foreign_keys=OFF;

DELETE FROM challenges WHERE type = 'registration';

CREATE TABLE challenges_old
    (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('invite', 'password_reset', 'mfa_reset')),
        hashed_secret TEXT NOT NULL,
        attempts_left INTEGER NOT NULL DEFAULT 3,
        expires_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        invite_id TEXT,
        user_id TEXT,

        CONSTRAINT fk_challenges_invite_id
            FOREIGN KEY (invite_id) REFERENCES invites (id) ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_challenges_user_id
            FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,

        CONSTRAINT chk_challenges_attempts_left
            CHECK (attempts_left >= 0),
        CONSTRAINT chk_challenges_mutual_exclusive
            CHECK ( (invite_id IS NOT NULL AND user_id IS NULL) OR (invite_id IS NULL AND user_id IS NOT NULL) )
    );

INSERT INTO challenges_old (id, type, hashed_secret, attempts_left, expires_at,
    created_at, deleted_at, invite_id, user_id)
SELECT id, type, hashed_secret, attempts_left, expires_at,
    created_at, deleted_at, invite_id, user_id FROM challenges;

DROP TABLE challenges;
ALTER TABLE challenges_old RENAME TO challenges;

CREATE INDEX idx_challenges_expires_at ON challenges (expires_at);
CREATE UNIQUE INDEX idx_challenge_invite ON challenges (invite_id) WHERE invite_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_challenge_user ON challenges (user_id) WHERE user_id IS NOT NULL AND deleted_at IS NULL;

PRAGMA foreign_keys=ON;
