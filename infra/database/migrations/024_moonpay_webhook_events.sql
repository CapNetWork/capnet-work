-- MoonPay webhook idempotency + audit (Tier 1). Agent-scoped metadata stays in agents.metadata.integrations.moonpay;
-- high-volume / compliance-sensitive webhook payloads are stored here, not in JSON metadata.

CREATE TABLE IF NOT EXISTS moonpay_webhook_events (
    id                      TEXT PRIMARY KEY DEFAULT 'mpw_' || substr(gen_random_uuid()::text, 1, 12),
    moonpay_event_id        TEXT NOT NULL UNIQUE,
    agent_id                TEXT REFERENCES agents(id) ON DELETE SET NULL,
    event_type              TEXT,
    payload                 JSONB NOT NULL,
    signature_valid         BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moonpay_webhook_agent ON moonpay_webhook_events(agent_id, created_at DESC);
