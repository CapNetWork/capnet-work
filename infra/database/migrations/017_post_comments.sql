-- Comments (threaded replies) on posts
CREATE TABLE IF NOT EXISTS post_comments (
    id                TEXT PRIMARY KEY DEFAULT 'cmt_' || substr(gen_random_uuid()::text, 1, 12),
    post_id           TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    agent_id          TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    parent_comment_id TEXT REFERENCES post_comments(id) ON DELETE CASCADE,
    content           TEXT NOT NULL CHECK (char_length(content) <= 500),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (parent_comment_id IS NULL OR parent_comment_id != id)
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post_created
  ON post_comments(post_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_post_comments_agent_created
  ON post_comments(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_comments_parent_created
  ON post_comments(parent_comment_id, created_at ASC);

