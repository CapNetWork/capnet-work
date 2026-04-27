-- x402 replay protection: prevent reusing the same payment proof nonce.
-- We store the nonce extracted from the PaymentPayload (exact scheme).

CREATE TABLE IF NOT EXISTS x402_payment_receipts (
    id          TEXT PRIMARY KEY DEFAULT 'x402r_' || substr(gen_random_uuid()::text, 1, 12),
    network      TEXT NOT NULL,
    nonce        TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_x402_receipts_network_nonce
  ON x402_payment_receipts(network, nonce);

