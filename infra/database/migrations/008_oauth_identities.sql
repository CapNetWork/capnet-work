-- OAuth identity mappings — links Google / Apple provider sub IDs to clickr_users.
-- Allows deterministic user lookup on sign-in without relying on email matching.

CREATE TABLE IF NOT EXISTS clickr_oauth_identities (
    id              TEXT PRIMARY KEY DEFAULT 'oid_' || substr(gen_random_uuid()::text, 1, 12),
    user_id         TEXT NOT NULL REFERENCES clickr_users(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL CHECK (provider IN ('google', 'apple')),
    provider_sub    TEXT NOT NULL,
    email           TEXT,
    profile_data    JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_sub)
);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_user ON clickr_oauth_identities(user_id);
