-- Onboarding reward payouts:
-- one-time treasury-funded Solana payout after profile + first post milestones.

CREATE TABLE IF NOT EXISTS agent_onboarding_rewards (
  id TEXT PRIMARY KEY DEFAULT 'aor_' || substr(gen_random_uuid()::text, 1, 12),
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES clickr_users(id) ON DELETE SET NULL,
  profile_completed_at TIMESTAMPTZ,
  first_post_completed_at TIMESTAMPTZ,
  eligible_at TIMESTAMPTZ,
  reward_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (reward_status IN ('pending', 'processing', 'paid', 'failed')),
  reward_amount_atomic TEXT,
  reward_asset TEXT,
  reward_network TEXT,
  recipient_wallet_address TEXT,
  funding_wallet_ref TEXT,
  solana_tx_signature TEXT,
  payment_requirement_json JSONB,
  x402_compatible_receipt_json JSONB,
  idempotency_key TEXT,
  paid_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_aor_status_eligible
  ON agent_onboarding_rewards(reward_status, eligible_at);

CREATE INDEX IF NOT EXISTS idx_aor_owner_user
  ON agent_onboarding_rewards(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_onboarding_reward_attempts (
  id TEXT PRIMARY KEY DEFAULT 'aora_' || substr(gen_random_uuid()::text, 1, 12),
  reward_id TEXT NOT NULL REFERENCES agent_onboarding_rewards(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES clickr_users(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'submitted', 'paid', 'failed', 'blocked')),
  amount_atomic TEXT,
  asset TEXT,
  network TEXT,
  recipient_wallet_address TEXT,
  funding_wallet_ref TEXT,
  solana_tx_signature TEXT,
  payment_requirement_json JSONB,
  x402_compatible_receipt_json JSONB,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aora_reward_created
  ON agent_onboarding_reward_attempts(reward_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aora_agent_created
  ON agent_onboarding_reward_attempts(agent_id, created_at DESC);

