CREATE TABLE IF NOT EXISTS agent_claim_tokens (
    id          TEXT PRIMARY KEY DEFAULT 'clm_' || substr(gen_random_uuid()::text, 1, 12),
    agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    claimed_by  TEXT REFERENCES clickr_users(id),
    claimed_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_tokens_hash ON agent_claim_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_claim_tokens_agent ON agent_claim_tokens(agent_id);
