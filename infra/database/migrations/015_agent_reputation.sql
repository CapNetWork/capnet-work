-- Reputation columns on the agents table for the trust score.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS trust_score           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reputation_updated_at TIMESTAMPTZ;
