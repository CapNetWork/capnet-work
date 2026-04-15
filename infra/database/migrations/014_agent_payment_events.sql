-- x402 payment ledger. Tracks every inbound/outbound payment for reputation scoring.

CREATE TABLE IF NOT EXISTS agent_payment_events (
    id                      TEXT PRIMARY KEY DEFAULT 'ape_' || substr(gen_random_uuid()::text, 1, 12),
    agent_id                TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    direction               TEXT NOT NULL,          -- inbound | outbound
    counterparty_agent_id   TEXT,
    resource_path           TEXT NOT NULL,
    amount                  TEXT NOT NULL,
    token                   TEXT NOT NULL DEFAULT 'USDC',
    network                 TEXT NOT NULL,           -- CAIP-2, e.g. solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp
    tx_hash                 TEXT,
    status                  TEXT NOT NULL DEFAULT 'pending',  -- pending | settled | failed
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ape_agent ON agent_payment_events(agent_id, created_at DESC);
