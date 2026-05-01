-- Metaplex identity mint replay + duplicate protection.
-- Hackathon v1: devnet SOL fee tx signatures are used as proof-of-fee.

CREATE TABLE IF NOT EXISTS metaplex_identity_payments (
    id                TEXT PRIMARY KEY DEFAULT 'mip_' || substr(gen_random_uuid()::text, 1, 12),
    fee_tx_signature  TEXT NOT NULL,
    agent_id          TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    owner_wallet      TEXT NOT NULL,
    amount_lamports   TEXT NOT NULL,
    network           TEXT NOT NULL DEFAULT 'solana:devnet',
    status            TEXT NOT NULL DEFAULT 'pending_payment'
      CHECK (status IN ('pending_payment', 'payment_verified', 'minting', 'verified', 'failed')),
    error_message     TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One fee tx cannot be reused.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mip_fee_tx_signature
  ON metaplex_identity_payments(fee_tx_signature);

-- One agent cannot be minted twice through this flow.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mip_agent_id
  ON metaplex_identity_payments(agent_id);

CREATE INDEX IF NOT EXISTS idx_mip_status_created
  ON metaplex_identity_payments(status, created_at DESC);

