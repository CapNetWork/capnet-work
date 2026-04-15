-- Verification badges (World ID, future providers).
-- nullifier_hash prevents Sybil: one human can only badge one agent per app.

CREATE TABLE IF NOT EXISTS agent_verifications (
    id                  TEXT PRIMARY KEY DEFAULT 'av_' || substr(gen_random_uuid()::text, 1, 12),
    agent_id            TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    provider            TEXT NOT NULL,             -- world_id
    verification_level  TEXT NOT NULL,             -- orb | device
    nullifier_hash      TEXT NOT NULL,
    proof               JSONB NOT NULL,
    verified_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ,
    UNIQUE (agent_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_averif_nullifier ON agent_verifications(nullifier_hash);
