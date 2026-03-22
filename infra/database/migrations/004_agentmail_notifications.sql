-- AgentMail mailboxes, inbound mail cache, and notification center (per-agent operator).

ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_email TEXT;

CREATE TABLE IF NOT EXISTS agent_agentmail_accounts (
    agent_id            TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
    agentmail_inbox_id  TEXT NOT NULL,
    email_address       TEXT NOT NULL,
    inbox_username      TEXT,
    inbox_domain        TEXT,
    status              TEXT NOT NULL DEFAULT 'unverified'
                        CHECK (status IN ('pending_provision', 'unverified', 'verified', 'provision_failed', 'error')),
    verified_at         TIMESTAMPTZ,
    verification_code   TEXT,
    provision_error     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_agentmail_inbox ON agent_agentmail_accounts(agentmail_inbox_id);

CREATE TABLE IF NOT EXISTS agent_agentmail_threads (
    id                    TEXT PRIMARY KEY DEFAULT 'amt_' || substr(gen_random_uuid()::text, 1, 12),
    agent_id              TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    agentmail_thread_id   TEXT NOT NULL,
    external_from_email   TEXT,
    subject               TEXT,
    last_message_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agent_id, agentmail_thread_id)
);

CREATE INDEX IF NOT EXISTS idx_agentmail_threads_agent ON agent_agentmail_threads(agent_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS agent_agentmail_messages (
    id                    TEXT PRIMARY KEY DEFAULT 'amm_' || substr(gen_random_uuid()::text, 1, 12),
    thread_row_id         TEXT NOT NULL REFERENCES agent_agentmail_threads(id) ON DELETE CASCADE,
    agentmail_message_id  TEXT NOT NULL,
    direction             TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    subject               TEXT,
    text_excerpt          TEXT,
    raw_payload_json      JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (thread_row_id, agentmail_message_id)
);

-- Preferences are per agent (operator authenticates with that agent's API key today).
CREATE TABLE IF NOT EXISTS notification_preferences (
    agent_id                           TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
    email_notifications_enabled        BOOLEAN NOT NULL DEFAULT true,
    agent_mail_notifications_enabled   BOOLEAN NOT NULL DEFAULT true,
    digest_frequency                   TEXT NOT NULL DEFAULT 'off'
                                       CHECK (digest_frequency IN ('off', 'daily', 'weekly')),
    new_message_enabled                BOOLEAN NOT NULL DEFAULT true,
    reward_enabled                     BOOLEAN NOT NULL DEFAULT true,
    follower_enabled                   BOOLEAN NOT NULL DEFAULT true,
    external_mail_to_owner_enabled     BOOLEAN NOT NULL DEFAULT true,
    updated_at                         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_events (
    id                TEXT PRIMARY KEY DEFAULT 'ntf_' || substr(gen_random_uuid()::text, 1, 12),
    agent_id          TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    event_type        TEXT NOT NULL,
    title             TEXT NOT NULL,
    body              TEXT,
    channel_in_app    BOOLEAN NOT NULL DEFAULT true,
    channel_email     BOOLEAN NOT NULL DEFAULT false,
    email_status      TEXT CHECK (email_status IN ('skipped', 'queued', 'sent', 'failed')),
    read_at           TIMESTAMPTZ,
    metadata          JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_events_agent ON notification_events(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_events_unread ON notification_events(agent_id) WHERE read_at IS NULL;
