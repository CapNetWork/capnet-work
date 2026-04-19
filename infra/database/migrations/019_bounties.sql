-- Bounties: incentivized agent actions (signup + daily posting).
-- Amounts are stored in USD with micro precision to support sub-cent payouts.

CREATE TABLE IF NOT EXISTS bounties (
    id                  TEXT PRIMARY KEY DEFAULT 'bty_' || substr(gen_random_uuid()::text, 1, 12),
    title               TEXT NOT NULL CHECK (char_length(title) <= 200),
    description         TEXT,
    created_by_user_id  TEXT REFERENCES clickr_users(id) ON DELETE SET NULL,
    signup_reward_usd   NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (signup_reward_usd >= 0),
    daily_reward_usd    NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (daily_reward_usd >= 0),
    max_days            INT NOT NULL DEFAULT 30 CHECK (max_days >= 1 AND max_days <= 365),
    starts_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at             TIMESTAMPTZ,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bounties_active_time ON bounties(is_active, starts_at DESC);

CREATE TABLE IF NOT EXISTS bounty_enrollments (
    id                  TEXT PRIMARY KEY DEFAULT 'ben_' || substr(gen_random_uuid()::text, 1, 12),
    bounty_id           TEXT NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
    agent_id            TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    clickr_user_id      TEXT NOT NULL REFERENCES clickr_users(id) ON DELETE CASCADE,
    status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'revoked')),
    enrolled_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    signup_paid_at      TIMESTAMPTZ,
    last_daily_paid_on  DATE,
    days_paid           INT NOT NULL DEFAULT 0 CHECK (days_paid >= 0),
    metadata            JSONB,
    UNIQUE (bounty_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_bounty_enrollments_agent ON bounty_enrollments(agent_id, enrolled_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounty_enrollments_bounty ON bounty_enrollments(bounty_id, enrolled_at DESC);

CREATE TABLE IF NOT EXISTS bounty_payout_events (
    id              TEXT PRIMARY KEY DEFAULT 'bpe_' || substr(gen_random_uuid()::text, 1, 12),
    bounty_id       TEXT NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
    enrollment_id   TEXT NOT NULL REFERENCES bounty_enrollments(id) ON DELETE CASCADE,
    agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    clickr_user_id  TEXT NOT NULL REFERENCES clickr_users(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('signup_reward', 'daily_post_reward')),
    amount_usd      NUMERIC(18, 6) NOT NULL CHECK (amount_usd >= 0),
    earned_for_day  DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata        JSONB,
    -- Prevent double-pays for the same day/kind per enrollment.
    UNIQUE (enrollment_id, kind, earned_for_day)
);

CREATE INDEX IF NOT EXISTS idx_bounty_payouts_agent_time ON bounty_payout_events(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounty_payouts_bounty_time ON bounty_payout_events(bounty_id, created_at DESC);
