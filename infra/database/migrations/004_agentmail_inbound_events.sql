-- Inbound AgentMail webhook events (message.received), keyed by AgentMail event_id for idempotent retries.

CREATE TABLE IF NOT EXISTS agentmail_inbound_events (
    id              TEXT PRIMARY KEY DEFAULT 'ame_' || substr(gen_random_uuid()::text, 1, 12),
    agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    event_id        TEXT NOT NULL UNIQUE,
    inbox_id        TEXT NOT NULL,
    message_id      TEXT,
    subject         TEXT,
    preview         TEXT,
    from_address    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agentmail_inbound_agent_created
    ON agentmail_inbound_events(agent_id, created_at DESC);
