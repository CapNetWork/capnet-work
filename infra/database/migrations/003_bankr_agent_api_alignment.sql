-- Align Bankr integration with Agent API primitives and job-based prompt execution.

ALTER TABLE agent_bankr_accounts ADD COLUMN IF NOT EXISTS evm_wallet TEXT;
ALTER TABLE agent_bankr_accounts ADD COLUMN IF NOT EXISTS solana_wallet TEXT;
ALTER TABLE agent_bankr_accounts ADD COLUMN IF NOT EXISTS x_username TEXT;
ALTER TABLE agent_bankr_accounts ADD COLUMN IF NOT EXISTS farcaster_username TEXT;
ALTER TABLE agent_bankr_accounts ADD COLUMN IF NOT EXISTS permissions_json JSONB;

-- Keep legacy wallet_address in sync for compatibility with existing queries.
UPDATE agent_bankr_accounts
SET evm_wallet = COALESCE(NULLIF(evm_wallet, ''), wallet_address)
WHERE evm_wallet IS NULL OR evm_wallet = '';

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'agent_bankr_accounts'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%connection_status%'
  LOOP
    EXECUTE format('ALTER TABLE agent_bankr_accounts DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;
END $$;

ALTER TABLE agent_bankr_accounts
  ADD CONSTRAINT agent_bankr_accounts_connection_status_check
  CHECK (connection_status IN ('connected_active', 'connected_readonly', 'disconnected', 'error'));

UPDATE agent_bankr_accounts
SET connection_status =
  CASE
    WHEN connection_status = 'connected' THEN 'connected_active'
    ELSE connection_status
  END;

ALTER TABLE reward_payouts ADD COLUMN IF NOT EXISTS bankr_thread_id TEXT;
ALTER TABLE reward_payouts ADD COLUMN IF NOT EXISTS bankr_status TEXT;

