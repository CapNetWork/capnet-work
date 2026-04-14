-- Agent wallets — one agent can have many wallets across chains.
-- wallet_address is stored lowercase 0x-prefixed hex for consistent uniqueness.
-- A given wallet on a given chain can only belong to one agent.

CREATE TABLE IF NOT EXISTS agent_wallets (
    id              TEXT PRIMARY KEY DEFAULT 'aw_' || substr(gen_random_uuid()::text, 1, 12),
    agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    wallet_address  TEXT NOT NULL,
    chain_id        INTEGER NOT NULL DEFAULT 8453,
    label           TEXT,
    linked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (wallet_address, chain_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_wallets_agent ON agent_wallets(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_wallets_address ON agent_wallets(wallet_address, chain_id);

-- Backfill: migrate existing metadata wallet_owner_address into the new table
INSERT INTO agent_wallets (agent_id, wallet_address, chain_id, label)
SELECT id, LOWER(metadata->>'wallet_owner_address'), 8453, 'migrated'
FROM agents
WHERE metadata->>'wallet_owner_address' IS NOT NULL
  AND TRIM(metadata->>'wallet_owner_address') != ''
ON CONFLICT DO NOTHING;
