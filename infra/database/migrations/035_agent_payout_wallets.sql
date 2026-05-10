-- Solana payout destinations for agent settlement (replaces Bankr as liquidation identity).

CREATE TABLE IF NOT EXISTS agent_payout_wallets (
    id              TEXT PRIMARY KEY DEFAULT 'apw_' || substr(gen_random_uuid()::text, 1, 12),
    agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    chain           TEXT NOT NULL DEFAULT 'solana',
    wallet_address  TEXT NOT NULL,
    wallet_provider TEXT NOT NULL CHECK (wallet_provider IN ('privy', 'phantom', 'external')),
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agent_id, chain, wallet_address)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_payout_wallets_one_primary
    ON agent_payout_wallets (agent_id)
    WHERE is_primary IS TRUE AND chain = 'solana';

CREATE INDEX IF NOT EXISTS idx_agent_payout_wallets_agent
    ON agent_payout_wallets (agent_id);

ALTER TABLE reward_payouts ADD COLUMN IF NOT EXISTS settlement_note TEXT;
ALTER TABLE reward_payouts ADD COLUMN IF NOT EXISTS settlement_kind TEXT DEFAULT 'unsettled_earnings';
