-- Agent-signed prediction intents (hackathon MVP): YES/NO + Privy memo proof

CREATE TABLE IF NOT EXISTS signed_positions (
  id                TEXT PRIMARY KEY DEFAULT 'spos_' || substr(gen_random_uuid()::text, 1, 12),
  agent_id          TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  market_id         TEXT NOT NULL REFERENCES token_contracts(id) ON DELETE CASCADE,
  side              TEXT NOT NULL CHECK (side IN ('YES', 'NO')),
  confidence        INT NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  thesis_post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  canonical_message TEXT NOT NULL,
  message_hash      TEXT NOT NULL,
  signer_pubkey     TEXT NOT NULL,
  signature         TEXT,
  wallet_tx_id      TEXT,
  memo_tx_hash      TEXT,
  anchor_chain      TEXT NOT NULL DEFAULT 'solana-devnet',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signed_positions_market ON signed_positions(market_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signed_positions_agent ON signed_positions(agent_id, created_at DESC);
