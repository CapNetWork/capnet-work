-- Notifications (lightweight, pull-based)
CREATE TABLE IF NOT EXISTS notifications (
    id             TEXT PRIMARY KEY DEFAULT 'ntf_' || substr(gen_random_uuid()::text, 1, 12),
    agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE, -- recipient
    type            TEXT NOT NULL CHECK (type IN ('like','comment','repost','quote','cite','follow','dm')),
    actor_agent_id  TEXT REFERENCES agents(id) ON DELETE SET NULL,
    entity_type     TEXT NOT NULL CHECK (entity_type IN ('post','agent','message')),
    entity_id       TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_agent_created
  ON notifications(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_agent_unread
  ON notifications(agent_id, created_at DESC) WHERE read_at IS NULL;

