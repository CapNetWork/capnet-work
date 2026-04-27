-- Clickr arena: token contracts + intents + post linkage

CREATE TABLE IF NOT EXISTS token_contracts (
  id TEXT PRIMARY KEY DEFAULT 'tc_' || substr(gen_random_uuid()::text, 1, 12),
  chain_id TEXT NOT NULL DEFAULT 'solana',
  mint_address TEXT NOT NULL,
  symbol TEXT,
  name TEXT,
  decimals INT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, mint_address)
);

CREATE INDEX IF NOT EXISTS idx_token_contracts_created_at ON token_contracts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_contracts_mint ON token_contracts(chain_id, mint_address);

CREATE TABLE IF NOT EXISTS post_contract_refs (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES token_contracts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'primary',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, contract_id)
);

CREATE INDEX IF NOT EXISTS idx_post_contract_refs_contract ON post_contract_refs(contract_id, created_at DESC);

CREATE TABLE IF NOT EXISTS contract_intents (
  id TEXT PRIMARY KEY DEFAULT 'ti_' || substr(gen_random_uuid()::text, 1, 12),
  contract_id TEXT NOT NULL REFERENCES token_contracts(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  amount_lamports TEXT NOT NULL,
  slippage_bps INT NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'quoted', 'simulated', 'executed', 'failed')),
  quote_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_intents_contract ON contract_intents(contract_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_intents_agent ON contract_intents(agent_id, created_at DESC);
-- Clickr arena: token contracts + intents + post linkage
-- This migration is intentionally minimal (MVP) to satisfy web + SDK routes.

CREATE TABLE IF NOT EXISTS token_contracts (
  id TEXT PRIMARY KEY DEFAULT 'tc_' || substr(gen_random_uuid()::text, 1, 12),
  chain_id TEXT NOT NULL DEFAULT 'solana',
  mint_address TEXT NOT NULL,
  symbol TEXT,
  name TEXT,
  decimals INT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, mint_address)
);

CREATE INDEX IF NOT EXISTS idx_token_contracts_created_at ON token_contracts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_contracts_mint ON token_contracts(chain_id, mint_address);

CREATE TABLE IF NOT EXISTS post_contract_refs (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES token_contracts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'primary',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, contract_id)
);

CREATE INDEX IF NOT EXISTS idx_post_contract_refs_contract ON post_contract_refs(contract_id, created_at DESC);

CREATE TABLE IF NOT EXISTS contract_intents (
  id TEXT PRIMARY KEY DEFAULT 'ti_' || substr(gen_random_uuid()::text, 1, 12),
  contract_id TEXT NOT NULL REFERENCES token_contracts(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  amount_lamports TEXT NOT NULL,
  slippage_bps INT NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'quoted', 'simulated', 'executed', 'failed')),
  quote_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_intents_contract ON contract_intents(contract_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_intents_agent ON contract_intents(agent_id, created_at DESC);
