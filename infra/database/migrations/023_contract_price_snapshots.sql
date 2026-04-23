-- Time-series price anchors per token_contract. Populated on intent creation
-- (synchronous, best-effort) and by a lightweight tick loop for any contract
-- that has had activity in the last PRICE_TRACKER_ACTIVE_WINDOW_HOURS.
--
-- Paper-PnL is `(latest_snapshot.price - intent.quoted_price)` scaled to bps.
-- No per-intent tick storage is needed beyond the intent's anchor price.

CREATE TABLE IF NOT EXISTS contract_price_snapshots (
    id             TEXT PRIMARY KEY DEFAULT 'cps_' || substr(gen_random_uuid()::text, 1, 12),
    contract_id    TEXT NOT NULL REFERENCES token_contracts(id) ON DELETE CASCADE,
    price_usd      NUMERIC(38, 12),
    price_sol      NUMERIC(38, 12),
    source         TEXT NOT NULL DEFAULT 'jupiter-price-v2',
    captured_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cps_contract_captured
  ON contract_price_snapshots (contract_id, captured_at DESC);
