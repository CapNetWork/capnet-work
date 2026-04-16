const { Router } = require("express");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");
const { authenticateBySessionOrKey } = require("../middleware/auth");
const { parsePagination } = require("../middleware/pagination");
const { sanitizeBody, sanitizeUrl } = require("../middleware/sanitize");

const MAX_POST_LENGTH = 500;

const router = Router();

/** Validate and sanitize provenance fields in metadata (sources, confidence, etc.) */
function sanitizeProvenanceMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const out = {};
  if (Array.isArray(metadata.sources)) {
    out.sources = metadata.sources.slice(0, 20).filter((s) => typeof s === "string" && s.length <= 200);
  }
  if (Array.isArray(metadata.source_urls)) {
    out.source_urls = metadata.source_urls
      .slice(0, 10)
      .map((u) => (typeof u === "string" ? sanitizeUrl(u) : null))
      .filter((r) => r?.ok && r.value)
      .map((r) => r.value);
  }
  if (typeof metadata.source_type === "string" && metadata.source_type.length <= 100) {
    out.source_type = metadata.source_type.trim();
  }
  if (typeof metadata.confidence === "number" && metadata.confidence >= 0 && metadata.confidence <= 100) {
    out.confidence = Math.round(metadata.confidence);
  }
  if (typeof metadata.model_used === "string" && metadata.model_used.length <= 100) {
    out.model_used = metadata.model_used.trim();
  }
  if (typeof metadata.retrieval_timestamp === "string" && !isNaN(Date.parse(metadata.retrieval_timestamp))) {
    out.retrieval_timestamp = metadata.retrieval_timestamp;
  }
  if (typeof metadata.tx_hash === "string") {
    const t = metadata.tx_hash.trim();
    if (/^0x[a-fA-F0-9]{64}$/.test(t)) {
      out.tx_hash = t;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

router.post("/", authenticateAgent, sanitizeBody(["content"]), async (req, res, next) => {
  const { content, type = "post", metadata } = req.body;
  if (!content || typeof content !== "string") return res.status(400).json({ error: "content is required" });
  if (content.length > MAX_POST_LENGTH) {
    return res.status(400).json({
      error: `Post must be ${MAX_POST_LENGTH} characters or less (human-readable, feed-style)`,
      max_length: MAX_POST_LENGTH,
    });
  }
  const postType = type === "reasoning" ? "reasoning" : "post";

  const provenance = sanitizeProvenanceMetadata(metadata);
  const otherMeta = metadata && typeof metadata === "object" ? { ...metadata } : {};
  delete otherMeta.sources;
  delete otherMeta.source_urls;
  delete otherMeta.source_type;
  delete otherMeta.confidence;
  delete otherMeta.model_used;
  delete otherMeta.retrieval_timestamp;
  delete otherMeta.tx_hash;
  const finalMetadata =
    provenance || Object.keys(otherMeta).length > 0 ? { ...(provenance || {}), ...otherMeta } : null;

  try {
    const result = await pool.query(
      `INSERT INTO posts (agent_id, content, post_type, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id, agent_id, content, post_type, metadata, created_at`,
      [req.agent.id, content, postType, finalMetadata ? JSON.stringify(finalMetadata) : null]
    );
    const row = result.rows[0];
    const { processPostRewards } = require("../services/reward-pipeline");
    setImmediate(() => {
      processPostRewards(row.id).catch((err) => console.error("[rewards]", err.message));
    });
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

router.get("/agent/:agentId", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  const { type } = req.query;
  try {
    let query = `SELECT p.id, p.content, p.post_type, p.metadata, p.created_at, p.like_count, p.repost_count,
       a.name AS agent_name, a.avatar_url,
       a.trust_score,
       a.metadata AS agent_metadata,
       (wv.agent_id IS NOT NULL) AS human_backed,
       wv.verification_level,
       EXISTS (
         SELECT 1 FROM agent_wallets aw
         WHERE aw.agent_id = a.id AND aw.chain_type = 'solana'
         LIMIT 1
       ) AS wallet_connected,
       ref.reference_summary
       FROM posts p
       JOIN agents a ON a.id = p.agent_id
       LEFT JOIN agent_verifications wv ON wv.agent_id = a.id AND wv.provider = 'world_id'
       LEFT JOIN LATERAL (
         SELECT jsonb_build_object(
           'kind', pr.kind,
           'to_post', jsonb_build_object(
             'id', tp.id,
             'content', tp.content,
             'post_type', tp.post_type,
             'metadata', tp.metadata,
             'created_at', tp.created_at,
             'agent_id', ta.id,
             'agent_name', ta.name,
             'avatar_url', ta.avatar_url,
             'domain', ta.domain
           )
         ) AS reference_summary
         FROM post_references pr
         JOIN posts tp ON tp.id = pr.to_post_id
         JOIN agents ta ON ta.id = tp.agent_id
         WHERE pr.from_post_id = p.id
         ORDER BY pr.created_at DESC
         LIMIT 1
       ) ref ON TRUE
       WHERE p.agent_id = $1`;
    const params = [req.params.agentId];
    if (type === "reasoning" || type === "post") {
      query += ` AND p.post_type = $${params.length + 1}`;
      params.push(type);
    }
    query += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT p.id, p.content, p.post_type, p.metadata, p.created_at, p.like_count, p.repost_count,
              a.id AS agent_id, a.name AS agent_name,
              a.avatar_url, a.domain,
              a.trust_score,
              a.metadata AS agent_metadata,
              (wv.agent_id IS NOT NULL) AS human_backed,
              wv.verification_level,
              EXISTS (
                SELECT 1 FROM agent_wallets aw
                WHERE aw.agent_id = a.id AND aw.chain_type = 'solana'
                LIMIT 1
              ) AS wallet_connected,
              ref.reference_summary
       FROM posts p
       JOIN agents a ON a.id = p.agent_id
       LEFT JOIN agent_verifications wv ON wv.agent_id = a.id AND wv.provider = 'world_id'
       LEFT JOIN LATERAL (
         SELECT jsonb_build_object(
           'kind', pr.kind,
           'to_post', jsonb_build_object(
             'id', tp.id,
             'content', tp.content,
             'post_type', tp.post_type,
             'metadata', tp.metadata,
             'created_at', tp.created_at,
             'agent_id', ta.id,
             'agent_name', ta.name,
             'avatar_url', ta.avatar_url,
             'domain', ta.domain
           )
         ) AS reference_summary
         FROM post_references pr
         JOIN posts tp ON tp.id = pr.to_post_id
         JOIN agents ta ON ta.id = tp.agent_id
         WHERE pr.from_post_id = p.id
         ORDER BY pr.created_at DESC
         LIMIT 1
       ) ref ON TRUE
       WHERE p.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Post not found" });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/like", async (req, res, next) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE posts
       SET like_count = like_count + 1
       WHERE id = $1
       RETURNING id, like_count`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Post not found" });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

async function createReferencePost({
  client,
  actorAgentId,
  targetPostId,
  kind,
  content,
  metadata,
  postType,
}) {
  const provenance = sanitizeProvenanceMetadata(metadata);
  const otherMeta = metadata && typeof metadata === "object" ? { ...metadata } : {};
  delete otherMeta.sources;
  delete otherMeta.source_urls;
  delete otherMeta.source_type;
  delete otherMeta.confidence;
  delete otherMeta.model_used;
  delete otherMeta.retrieval_timestamp;
  delete otherMeta.tx_hash;
  const finalMetadata =
    provenance || Object.keys(otherMeta).length > 0 ? { ...(provenance || {}), ...otherMeta } : null;

  const postInsert = await client.query(
    `INSERT INTO posts (agent_id, content, post_type, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING id, agent_id, content, post_type, metadata, created_at`,
    [actorAgentId, content, postType, finalMetadata ? JSON.stringify(finalMetadata) : null]
  );
  const newPost = postInsert.rows[0];

  await client.query(
    `INSERT INTO post_references (from_post_id, to_post_id, kind)
     VALUES ($1, $2, $3)
     ON CONFLICT (from_post_id, to_post_id, kind) DO NOTHING`,
    [newPost.id, targetPostId, kind]
  );

  if (kind === "repost") {
    await client.query(
      `UPDATE posts SET repost_count = repost_count + 1 WHERE id = $1`,
      [targetPostId]
    );
  }

  return newPost;
}

router.post("/:id/repost", authenticateBySessionOrKey, async (req, res, next) => {
  const targetPostId = req.params.id;
  const actorAgentId = req.agent?.id;
  if (!actorAgentId) return res.status(401).json({ error: "Authentication required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const exists = await client.query(`SELECT id FROM posts WHERE id = $1`, [targetPostId]);
    if (exists.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Post not found" });
    }

    const newPost = await createReferencePost({
      client,
      actorAgentId,
      targetPostId,
      kind: "repost",
      content: "",
      postType: "post",
      metadata: { ...(req.body?.metadata || {}), ref_post_id: targetPostId, ref_kind: "repost" },
    });
    await client.query("COMMIT");
    res.status(201).json(newPost);
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    next(err);
  } finally {
    client.release();
  }
});

router.post("/:id/quote", authenticateBySessionOrKey, sanitizeBody(["content"]), async (req, res, next) => {
  const targetPostId = req.params.id;
  const actorAgentId = req.agent?.id;
  if (!actorAgentId) return res.status(401).json({ error: "Authentication required" });

  const { content, type = "post", metadata } = req.body || {};
  if (!content || typeof content !== "string") return res.status(400).json({ error: "content is required" });
  if (content.length > MAX_POST_LENGTH) {
    return res.status(400).json({
      error: `Post must be ${MAX_POST_LENGTH} characters or less (human-readable, feed-style)`,
      max_length: MAX_POST_LENGTH,
    });
  }
  const postType = type === "reasoning" ? "reasoning" : "post";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const exists = await client.query(`SELECT id FROM posts WHERE id = $1`, [targetPostId]);
    if (exists.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Post not found" });
    }

    const newPost = await createReferencePost({
      client,
      actorAgentId,
      targetPostId,
      kind: "quote",
      content,
      postType,
      metadata: { ...(metadata || {}), ref_post_id: targetPostId, ref_kind: "quote" },
    });
    await client.query("COMMIT");
    res.status(201).json(newPost);
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    next(err);
  } finally {
    client.release();
  }
});

router.post("/:id/cite", authenticateBySessionOrKey, sanitizeBody(["content"]), async (req, res, next) => {
  const targetPostId = req.params.id;
  const actorAgentId = req.agent?.id;
  if (!actorAgentId) return res.status(401).json({ error: "Authentication required" });

  const { content, type = "post", metadata } = req.body || {};
  if (!content || typeof content !== "string") return res.status(400).json({ error: "content is required" });
  if (content.length > MAX_POST_LENGTH) {
    return res.status(400).json({
      error: `Post must be ${MAX_POST_LENGTH} characters or less (human-readable, feed-style)`,
      max_length: MAX_POST_LENGTH,
    });
  }
  const postType = type === "reasoning" ? "reasoning" : "post";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const exists = await client.query(`SELECT id FROM posts WHERE id = $1`, [targetPostId]);
    if (exists.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Post not found" });
    }

    const newPost = await createReferencePost({
      client,
      actorAgentId,
      targetPostId,
      kind: "cite",
      content,
      postType,
      metadata: { ...(metadata || {}), ref_post_id: targetPostId, ref_kind: "cite" },
    });
    await client.query("COMMIT");
    res.status(201).json(newPost);
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
