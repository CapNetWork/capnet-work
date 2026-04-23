-- The canonical Clickr PvP move: a quoted buy/sell intent anchored to a Jupiter quote.
--
-- Operational state (`status`) tracks the draft -> quoted -> approved -> simulating ->
-- executing -> done|failed|canceled lifecycle.
-- Scoring state (`score_status`) tracks paper -> resolved PnL independently.
-- `wallet_tx_id` FKs to `agent_wallet_transactions` — the single source of truth for
-- on-chain status. Intents never store `tx_hash` / tx status directly.

CREATE TABLE IF NOT EXISTS contract_transaction_intents (
    id                             TEXT PRIMARY KEY DEFAULT 'cti_' || substr(gen_random_uuid()::text, 1, 12),
    contract_id                    TEXT NOT NULL REFERENCES token_contracts(id) ON DELETE CASCADE,
    created_by_agent_id            TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    wallet_id                      TEXT REFERENCES agent_wallets(id) ON DELETE SET NULL,

    side                           TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    amount_lamports                BIGINT NOT NULL,
    input_mint                     TEXT NOT NULL,
    output_mint                    TEXT NOT NULL,
    slippage_bps                   INTEGER NOT NULL DEFAULT 50,

    quote_json                     JSONB,
    quoted_price_usd               NUMERIC(38, 12),
    quoted_price_sol               NUMERIC(38, 12),
    quote_timestamp                TIMESTAMPTZ,
    quote_source                   TEXT DEFAULT 'jupiter-v6',

    status                         TEXT NOT NULL DEFAULT 'draft'
                                     CHECK (status IN ('draft','quoted','approved','simulating','executing','done','failed','canceled')),
    score_status                   TEXT NOT NULL DEFAULT 'pending'
                                     CHECK (score_status IN ('pending','paper_scored','resolved')),
    paper_pnl_bps                  INTEGER,
    realized_pnl_bps               INTEGER,
    resolved_at                    TIMESTAMPTZ,

    wallet_tx_id                   TEXT REFERENCES agent_wallet_transactions(id) ON DELETE SET NULL,
    approved_by                    TEXT,
    approved_at                    TIMESTAMPTZ,
    error_code                     TEXT,
    error_message                  TEXT,

    platform_fee_bps               INTEGER,
    platform_fee_amount_base_units BIGINT,
    platform_fee_mint              TEXT,
    platform_fee_account           TEXT,

    created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cti_contract_created
  ON contract_transaction_intents (contract_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cti_agent_created
  ON contract_transaction_intents (created_by_agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cti_score_status
  ON contract_transaction_intents (score_status);

CREATE INDEX IF NOT EXISTS idx_cti_status
  ON contract_transaction_intents (status);
