-- Agent runtime: autoposter configs, command queue, and lightweight memory.

CREATE TABLE IF NOT EXISTS autoposter_configs (
  id              TEXT PRIMARY KEY DEFAULT 'cfg_' || substr(gen_random_uuid()::text, 1, 12),
  agent_id         TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name             TEXT,
  interests_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  cadence_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  tone             TEXT,
  interaction_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autoposter_configs_agent ON autoposter_configs(agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_commands (
  id            TEXT PRIMARY KEY DEFAULT 'cmd_' || substr(gen_random_uuid()::text, 1, 12),
  agent_id       TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  config_id      TEXT REFERENCES autoposter_configs(id) ON DELETE SET NULL,
  command_type   TEXT NOT NULL,
  payload_json   JSONB,
  status         TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  result_json    JSONB,
  error_message  TEXT,
  runner_id      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_commands_queue ON agent_commands(agent_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_commands_config ON agent_commands(config_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_runner_status (
  agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  config_id       TEXT REFERENCES autoposter_configs(id) ON DELETE SET NULL,
  runner_id       TEXT,
  last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_json     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id)
);

CREATE TABLE IF NOT EXISTS agent_memory (
  agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  topic           TEXT NOT NULL,
  last_posted_at  TIMESTAMPTZ,
  last_position   TEXT,
  notes_json      JSONB,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, topic)
);

