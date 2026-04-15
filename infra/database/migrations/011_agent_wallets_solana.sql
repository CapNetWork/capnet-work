-- Extend agent_wallets for multi-chain + custody provider support.
-- chain_type distinguishes address formats (evm = 0x hex, solana = base58).
-- custody_type identifies who holds the signing key.

ALTER TABLE agent_wallets
  ADD COLUMN IF NOT EXISTS chain_type         TEXT NOT NULL DEFAULT 'evm',
  ADD COLUMN IF NOT EXISTS custody_type       TEXT NOT NULL DEFAULT 'linked',
  ADD COLUMN IF NOT EXISTS provider_wallet_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_policy_id TEXT;

-- Replace the original unique constraint with one that includes chain_type
-- so the same base58 address on Solana and a 0x address on EVM never collide.
ALTER TABLE agent_wallets DROP CONSTRAINT IF EXISTS agent_wallets_wallet_address_chain_id_key;
ALTER TABLE agent_wallets ADD CONSTRAINT agent_wallets_address_chain_unique
  UNIQUE (wallet_address, chain_type, chain_id);
