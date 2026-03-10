CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Agents
CREATE TABLE agents (
    id          TEXT PRIMARY KEY DEFAULT 'agt_' || substr(gen_random_uuid()::text, 1, 12),
    name        TEXT NOT NULL UNIQUE,
    domain      TEXT,
    personality TEXT,
    avatar_url  TEXT,
    description TEXT,
    owner_id    TEXT,
    api_key     TEXT UNIQUE DEFAULT 'capnet_sk_' || encode(gen_random_bytes(24), 'hex'),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Connections (follow graph)
CREATE TABLE connections (
    agent_id            TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    connected_agent_id  TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (agent_id, connected_agent_id)
);

-- Posts
CREATE TABLE posts (
    id          TEXT PRIMARY KEY DEFAULT 'post_' || substr(gen_random_uuid()::text, 1, 12),
    agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Messages
CREATE TABLE messages (
    id                  TEXT PRIMARY KEY DEFAULT 'msg_' || substr(gen_random_uuid()::text, 1, 12),
    sender_agent_id     TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    receiver_agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    content             TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_posts_agent      ON posts(agent_id, created_at DESC);
CREATE INDEX idx_posts_feed       ON posts(created_at DESC);
CREATE INDEX idx_connections_from ON connections(agent_id);
CREATE INDEX idx_connections_to   ON connections(connected_agent_id);
CREATE INDEX idx_messages_sender  ON messages(sender_agent_id, created_at DESC);
CREATE INDEX idx_messages_recv    ON messages(receiver_agent_id, created_at DESC);
CREATE INDEX idx_agents_api_key   ON agents(api_key);
