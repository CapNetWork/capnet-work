-- Clickr Connect — human accounts, user OAuth, grants, audit (Phase 1 schema scaffold).
-- API routes are mounted only when ENABLE_CLICKR_CONNECT=1. Existing agent + integrations APIs unchanged.

CREATE TABLE IF NOT EXISTS clickr_users (
    id                  TEXT PRIMARY KEY DEFAULT 'usr_' || substr(gen_random_uuid()::text, 1, 12),
    email               TEXT UNIQUE,
    email_verified_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clickr_sessions (
    id          TEXT PRIMARY KEY DEFAULT 'ses_' || substr(gen_random_uuid()::text, 1, 12),
    user_id     TEXT NOT NULL REFERENCES clickr_users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clickr_sessions_user ON clickr_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_clickr_sessions_expires ON clickr_sessions(expires_at);

CREATE TABLE IF NOT EXISTS clickr_user_provider_connections (
    id                      TEXT PRIMARY KEY DEFAULT 'upc_' || substr(gen_random_uuid()::text, 1, 12),
    user_id                 TEXT NOT NULL REFERENCES clickr_users(id) ON DELETE CASCADE,
    provider_id             TEXT NOT NULL,
    encrypted_credentials   BYTEA,
    scopes                  TEXT[],
    status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'error')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_clickr_upc_user ON clickr_user_provider_connections(user_id);

CREATE TABLE IF NOT EXISTS clickr_permission_grants (
    id                          TEXT PRIMARY KEY DEFAULT 'gra_' || substr(gen_random_uuid()::text, 1, 12),
    user_id                     TEXT NOT NULL REFERENCES clickr_users(id) ON DELETE CASCADE,
    agent_id                    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_provider_connection_id TEXT NOT NULL REFERENCES clickr_user_provider_connections(id) ON DELETE CASCADE,
    scopes                      TEXT[] NOT NULL DEFAULT '{}',
    revoked_at                  TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clickr_grants_active_triple
    ON clickr_permission_grants (user_id, agent_id, user_provider_connection_id)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clickr_grants_user ON clickr_permission_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_clickr_grants_agent ON clickr_permission_grants(agent_id);

CREATE TABLE IF NOT EXISTS clickr_audit_events (
    id              TEXT PRIMARY KEY DEFAULT 'cae_' || substr(gen_random_uuid()::text, 1, 12),
    user_id         TEXT NOT NULL REFERENCES clickr_users(id) ON DELETE CASCADE,
    actor_agent_id  TEXT REFERENCES agents(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    provider_id     TEXT,
    metadata        JSONB,
    outcome         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clickr_audit_user_time ON clickr_audit_events(user_id, created_at DESC);
