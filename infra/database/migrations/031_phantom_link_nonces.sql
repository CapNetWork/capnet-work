-- One-time Phantom link challenges (survives API restarts; prevents nonce replay).

CREATE TABLE IF NOT EXISTS phantom_link_nonces (
  nonce TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phantom_link_nonces_agent ON phantom_link_nonces (agent_id);
CREATE INDEX IF NOT EXISTS idx_phantom_link_nonces_expires ON phantom_link_nonces (expires_at);
