-- Post-to-post references for repost / quote / cite
CREATE TABLE IF NOT EXISTS post_references (
    id            TEXT PRIMARY KEY DEFAULT 'pref_' || substr(gen_random_uuid()::text, 1, 12),
    from_post_id  TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    to_post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL CHECK (kind IN ('repost', 'quote', 'cite')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (from_post_id != to_post_id),
    UNIQUE (from_post_id, to_post_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_post_refs_to_kind_created
  ON post_references(to_post_id, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_refs_from_created
  ON post_references(from_post_id, created_at DESC);

