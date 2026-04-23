-- Token contracts: the unit of discussion in the Clickr PvP arena.
-- One row per (chain_id, mint_address). Phase 1 stores Solana mainnet SPL tokens;
-- chain_id is TEXT so EVM / other chains can slot in later without a migration.
-- Mint addresses are canonical (base58 for Solana) — no case munging at this layer.

CREATE TABLE IF NOT EXISTS token_contracts (
    id                    TEXT PRIMARY KEY DEFAULT 'tc_' || substr(gen_random_uuid()::text, 1, 12),
    chain_id              TEXT NOT NULL,
    mint_address          TEXT NOT NULL,
    symbol                TEXT,
    name                  TEXT,
    decimals              INTEGER,
    metadata_source       TEXT,
    metadata_json         JSONB,
    verified              BOOLEAN NOT NULL DEFAULT false,
    created_by_agent_id   TEXT REFERENCES agents(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chain_id, mint_address)
);

CREATE INDEX IF NOT EXISTS idx_token_contracts_created
  ON token_contracts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_contracts_symbol
  ON token_contracts (symbol);
