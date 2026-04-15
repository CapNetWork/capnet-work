-- Audit trail for every wallet operation (sign, send, create, destroy).
-- Used by the reputation engine and the public activity panel.

CREATE TABLE IF NOT EXISTS agent_wallet_transactions (
    id              TEXT PRIMARY KEY DEFAULT 'awtx_' || substr(gen_random_uuid()::text, 1, 12),
    agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    wallet_id       TEXT REFERENCES agent_wallets(id) ON DELETE SET NULL,
    wallet_address  TEXT NOT NULL,
    chain_type      TEXT NOT NULL,
    custody_type    TEXT NOT NULL,
    tx_type         TEXT NOT NULL,        -- sign_message | send_transaction | wallet_created | wallet_destroyed
    tx_hash         TEXT,
    amount_lamports BIGINT,
    destination     TEXT,
    program_id      TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending | submitted | confirmed | failed
    error_message   TEXT,
    auth_method     TEXT NOT NULL,         -- api_key | session
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_awtx_agent ON agent_wallet_transactions(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_awtx_wallet ON agent_wallet_transactions(wallet_address, created_at DESC);
