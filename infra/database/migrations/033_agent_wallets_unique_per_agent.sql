-- Allow the same external wallet (e.g. Phantom pubkey) to be linked to multiple agents.
-- Each agent still has at most one row per (wallet_address, chain_type, chain_id).
-- Idempotent: AUTO_MIGRATE re-runs all files on each API boot.
ALTER TABLE agent_wallets DROP CONSTRAINT IF EXISTS agent_wallets_address_chain_unique;

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
                 PARTITION BY agent_id, wallet_address, chain_type, chain_id
                 ORDER BY linked_at DESC NULLS LAST, id
               ) AS rn
        FROM agent_wallets
      ) ranked
      WHERE rn > 1
    );

    ALTER TABLE agent_wallets ADD CONSTRAINT agent_wallets_agent_address_chain_unique
      UNIQUE (agent_id, wallet_address, chain_type, chain_id);
  END IF;
END $$;
