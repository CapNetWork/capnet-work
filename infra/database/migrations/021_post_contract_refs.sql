-- Post -> token_contract linkage.
-- Root posts on a contract are `kind='primary'`; any post that mentions a contract
-- inline (without being the root) is `kind='mention'`. Replies inherit context via
-- the thread (parent post), so they do NOT need their own ref row.

CREATE TABLE IF NOT EXISTS post_contract_refs (
    id           TEXT PRIMARY KEY DEFAULT 'pcr_' || substr(gen_random_uuid()::text, 1, 12),
    post_id      TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    contract_id  TEXT NOT NULL REFERENCES token_contracts(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL CHECK (kind IN ('primary', 'mention')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (post_id, contract_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_pcr_contract_created
  ON post_contract_refs (contract_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pcr_post_kind
  ON post_contract_refs (post_id, kind);
