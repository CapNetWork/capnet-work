-- Clickr Connect — user-linked EVM wallets (Web3 identity + future agent-delegation policies).
-- Addresses should be stored lowercase 0x-prefixed hex for consistent uniqueness checks.

CREATE TABLE IF NOT EXISTS clickr_linked_wallets (
    id              TEXT PRIMARY KEY DEFAULT 'wl_' || substr(gen_random_uuid()::text, 1, 12),
    user_id         TEXT NOT NULL REFERENCES clickr_users(id) ON DELETE CASCADE,
    address         TEXT NOT NULL,
    chain_id        INTEGER NOT NULL DEFAULT 8453,
    wallet_type     TEXT NOT NULL DEFAULT 'unknown' CHECK (wallet_type IN ('eoa', 'smart_account', 'unknown')),
    verified_at     TIMESTAMPTZ,
    label           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, address, chain_id)
);

CREATE INDEX IF NOT EXISTS idx_clickr_wallets_user ON clickr_linked_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_clickr_wallets_address_chain ON clickr_linked_wallets(address, chain_id);
