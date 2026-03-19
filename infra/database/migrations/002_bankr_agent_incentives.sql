-- Bankr agent incentives: accounts, scoring, balances, payouts, duplicate tracking
-- Post engagement columns for scoring (views, likes, reposts)

ALTER TABLE posts ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS repost_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS agent_bankr_accounts (
    id              TEXT PRIMARY KEY DEFAULT 'bra_' || substr(gen_random_uuid()::text, 1, 12),
    agent_id        TEXT NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
    wallet_address  TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    connection_status TEXT NOT NULL DEFAULT 'connected' CHECK (connection_status IN ('connected', 'disconnected', 'error')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_reward_scores (
    id              TEXT PRIMARY KEY DEFAULT 'prs_' || substr(gen_random_uuid()::text, 1, 12),
    post_id         TEXT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
    agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    eligible        BOOLEAN NOT NULL DEFAULT false,
    score           DOUBLE PRECISION NOT NULL DEFAULT 0,
    score_multiplier DOUBLE PRECISION NOT NULL DEFAULT 0,
    base_reward     DOUBLE PRECISION NOT NULL DEFAULT 0,
    final_reward    DOUBLE PRECISION NOT NULL DEFAULT 0,
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_reward_balances (
    id              TEXT PRIMARY KEY DEFAULT 'arb_' || substr(gen_random_uuid()::text, 1, 12),
    agent_id        TEXT NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
    pending_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
    paid_balance    DOUBLE PRECISION NOT NULL DEFAULT 0,
    last_payout_at  TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reward_payouts (
    id              TEXT PRIMARY KEY DEFAULT 'rpo_' || substr(gen_random_uuid()::text, 1, 12),
    agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    amount          DOUBLE PRECISION NOT NULL,
    wallet_address  TEXT NOT NULL,
    bankr_job_id    TEXT,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'completed', 'failed')),
    tx_hash         TEXT,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_hashes (
    id              TEXT PRIMARY KEY DEFAULT 'phs_' || substr(gen_random_uuid()::text, 1, 12),
    post_id         TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    content_hash    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agent_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_post_reward_scores_agent ON post_reward_scores(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_reward_scores_eligible ON post_reward_scores(agent_id) WHERE eligible = true;
CREATE INDEX IF NOT EXISTS idx_reward_payouts_agent ON reward_payouts(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_hashes_lookup ON post_hashes(agent_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_agent_bankr_status ON agent_bankr_accounts(connection_status);
