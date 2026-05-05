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
ALTER TABLE agent_wallets DROP CONSTRAINT IF EXISTS agent_wallets_address_chain_unique;

-- AUTO_MIGRATE runs every migration file on each boot (see apps/api/src/index.js).
-- Migration 033 replaces global uniqueness with per-agent uniqueness. Re-adding the
-- global unique on every boot fails once the same wallet is linked to multiple agents.
-- When 033 is already applied, skip recreating the global constraint.
--
-- Deduplicate duplicate (wallet_address, chain_type, chain_id) rows before adding
-- the global unique (keep newest linked_at).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    INNER JOIN pg_class t ON c.conrelid = t.oid AND t.relname = 'agent_wallets'
    WHERE c.conname = 'agent_wallets_agent_address_chain_unique'
  ) THEN
    DELETE FROM agent_wallets
    WHERE ctid IN (
      SELECT ctid
      FROM (
        SELECT ctid,
               ROW_NUMBER() OVER (
                 PARTITION BY wallet_address, chain_type, chain_id
                 ORDER BY linked_at DESC NULLS LAST, id
               ) AS rn
        FROM agent_wallets
      ) ranked
      WHERE rn > 1
    );

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      INNER JOIN pg_class t ON c.conrelid = t.oid AND t.relname = 'agent_wallets'
      WHERE c.conname = 'agent_wallets_address_chain_unique'
    ) THEN
      ALTER TABLE agent_wallets ADD CONSTRAINT agent_wallets_address_chain_unique
        UNIQUE (wallet_address, chain_type, chain_id);
    END IF;
  END IF;
END $$;
