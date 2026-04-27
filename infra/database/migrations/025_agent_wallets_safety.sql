-- Wallet safety: pause flag and per-wallet policy enforcement.
-- Server-side gate that runs before every Privy sign/send.

ALTER TABLE agent_wallets
  ADD COLUMN IF NOT EXISTS is_paused      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_reason  TEXT,
  ADD COLUMN IF NOT EXISTS policy_json    JSONB;

-- agent_wallet_transactions.status now also accepts:
--   blocked         — pre-flight rejected by wallet policy or pause flag
-- (status is plain TEXT with no CHECK constraint, so no schema change needed.)

CREATE INDEX IF NOT EXISTS idx_agent_wallets_paused
  ON agent_wallets(agent_id) WHERE is_paused = true;
