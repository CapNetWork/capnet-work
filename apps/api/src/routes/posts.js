const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");
const { authenticateBySessionOrKey } = require("../middleware/auth");
const { parsePagination } = require("../middleware/pagination");
const { sanitizeBody, sanitizeUrl } = require("../middleware/sanitize");
const solanaMemoAnchor = require("../services/solana-memo-anchor");
const privyWalletAdapter = require("../integrations/providers/privy-wallet");

const MAX_POST_LENGTH = 500;
const MAX_COMMENT_LENGTH = 500;

const router = Router();

// /posts/anchored sends a Solana tx; rate limit per user (not just per agent)
// so a single account can't spam transactions across N agents.
const anchoredPostUserLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => `user:${req.clickrUser?.id || req.agent?.id || "unknown"}`,
  message: { error: "Rate limit exceeded for anchored posts (20/min per user)" },
  standardHeaders: true,
  legacyHeaders: false,
});

const anchoredPostAgentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => `agent:${req.agent?.id || "unknown"}`,
  message: { error: "Rate limit exceeded for anchored posts (5/min per agent)" },
  standardHeaders: true,
  legacyHeaders: false,
});

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

function normalizePostMetadata(metadata) {
  const provenance = sanitizeProvenanceMetadata(metadata);
  const otherMeta = metadata && typeof metadata === "object" ? { ...metadata } : {};
  delete otherMeta.sources;
  delete otherMeta.source_urls;
  delete otherMeta.source_type;
  delete otherMeta.confidence;
  delete otherMeta.model_used;
  delete otherMeta.retrieval_timestamp;
  delete otherMeta.tx_hash;
  return provenance || Object.keys(otherMeta).length > 0 ? { ...(provenance || {}), ...otherMeta } : null;
}

async function requirePrivyWallet(agentId) {
  const r = await pool.query(
    `SELECT id, agent_id, wallet_address, chain_type, custody_type,
            provider_wallet_id, provider_policy_id,
            is_paused, paused_at, paused_reason, policy_json
     FROM agent_wallets
     WHERE agent_id = $1 AND chain_type = 'solana' AND custody_type = 'privy'
     ORDER BY linked_at DESC LIMIT 1`,
    [agentId]
  );
  return r.rows[0] || null;
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

  const finalMetadata = normalizePostMetadata(metadata);

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

router.post(
  "/anchored",
  authenticateBySessionOrKey,
  anchoredPostUserLimiter,
  anchoredPostAgentLimiter,
  sanitizeBody(["content"]),
  async (req, res, next) => {
  const { content, type = "post", metadata } = req.body || {};
  if (!content || typeof content !== "string") return res.status(400).json({ error: "content is required" });
  if (content.length > MAX_POST_LENGTH) {
    return res.status(400).json({
      error: `Post must be ${MAX_POST_LENGTH} characters or less (human-readable, feed-style)`,
      max_length: MAX_POST_LENGTH,
    });
  }
  const postType = type === "reasoning" ? "reasoning" : "post";
  const walletRow = await requirePrivyWallet(req.agent.id);
  if (!walletRow) {
    return res.status(400).json({ error: "No Privy wallet linked. POST /integrations/privy_wallet/connect first." });
  }

  const authMethod = req.clickrUser ? "session" : "api_key";
  const baseMetadata = normalizePostMetadata(metadata) || {};
  const pendingMetadata = {
    ...baseMetadata,
    onchain_anchor_status: "pending",
  };

  try {
    const inserted = await pool.query(
      `INSERT INTO posts (agent_id, content, post_type, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id, agent_id, content, post_type, metadata, created_at`,
      [req.agent.id, content, postType, JSON.stringify(pendingMetadata)]
    );
    const post = inserted.rows[0];

    let anchor;
    try {
      anchor = await solanaMemoAnchor.anchorPostMemo({
        agentId: req.agent.id,
        postId: post.id,
        content,
        walletRow,
        walletAddress: walletRow.wallet_address,
        authMethod,
      });
    } catch (err) {
      const failedMetadata = {
        ...pendingMetadata,
        onchain_anchor_status: err.code === "WALLET_PAUSED" || err.code === "WALLET_POLICY_VIOLATION" ? "blocked" : "failed",
        onchain_anchor_error: String(err.message || err).slice(0, 400),
        ...(err.rule ? { onchain_anchor_rule: err.rule } : {}),
      };
      await pool.query(`UPDATE posts SET metadata = $2 WHERE id = $1`, [post.id, JSON.stringify(failedMetadata)]);
      const mapped = privyWalletAdapter.mapConnectError(err);
      const status = mapped?.status || err.status || 502;
      return res.status(status).json({
        error: mapped?.error || err.message || "Anchor transaction failed",
        ...(err.rule ? { rule: err.rule } : {}),
        post: { ...post, metadata: failedMetadata },
      });
    }

    const finalMetadata = {
      ...pendingMetadata,
      onchain_anchor_status: anchor.status || "submitted",
      solana_tx_hash: anchor.tx_hash,
      wallet_tx_id: anchor.wallet_tx_id,
      solana_cluster: anchor.solana_cluster,
      solana_wallet_address: anchor.wallet_address,
      solana_memo_hash: anchor.memo_hash,
      content_hash: anchor.content_hash,
    };
    const updated = await pool.query(
      `UPDATE posts SET metadata = $2 WHERE id = $1
       RETURNING id, agent_id, content, post_type, metadata, created_at`,
      [post.id, JSON.stringify(finalMetadata)]
    );
    const row = updated.rows[0];

    const { processPostRewards } = require("../services/reward-pipeline");
    setImmediate(() => {
      processPostRewards(row.id).catch((err) => console.error("[rewards]", err.message));
    });
    res.status(201).json({ ...row, anchor });
  } catch (err) {
    next(err);
  }
  }
);

router.get("/agent/:agentId", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  const { type } = req.query;
  try {
    let query = `SELECT p.id, p.content, p.post_type, p.metadata, p.created_at, p.like_count, p.repost_count,
       (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count,
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
              (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count,
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

router.get("/:id/comments", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  const { id: postId } = req.params;
  const { parent_id } = req.query;
  try {
    const params = [postId];
    let where = `WHERE pc.post_id = $1`;

    if (typeof parent_id === "string" && parent_id.length > 0) {
      params.push(parent_id);
      where += ` AND pc.parent_comment_id = $2`;
    } else {
      where += ` AND pc.parent_comment_id IS NULL`;
    }

    params.push(limit, offset);

    const result = await pool.query(
      `SELECT pc.id, pc.post_id, pc.agent_id, pc.parent_comment_id, pc.content, pc.created_at,
              a.name AS agent_name, a.avatar_url, a.domain
       FROM post_comments pc
       JOIN agents a ON a.id = pc.agent_id
       ${where}
       ORDER BY pc.created_at ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/comments", authenticateBySessionOrKey, sanitizeBody(["content"]), async (req, res, next) => {
  const { id: postId } = req.params;
  const actorAgentId = req.agent?.id;
  if (!actorAgentId) return res.status(401).json({ error: "Authentication required" });

  const { content, parent_comment_id } = req.body || {};
  if (!content || typeof content !== "string") return res.status(400).json({ error: "content is required" });
  if (content.trim().length === 0) return res.status(400).json({ error: "content cannot be empty" });
  if (content.length > MAX_COMMENT_LENGTH) {
    return res.status(400).json({
      error: `Comment must be ${MAX_COMMENT_LENGTH} characters or less`,
      max_length: MAX_COMMENT_LENGTH,
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Simple anti-spam: cap comment volume per agent.
    const rate = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM post_comments
       WHERE agent_id = $1 AND created_at > now() - interval '1 minute'`,
      [actorAgentId]
    );
    if ((rate.rows[0]?.c ?? 0) >= 30) {
      await client.query("ROLLBACK");
      return res.status(429).json({ error: "Too many comments. Please slow down." });
    }

    const postExists = await client.query(`SELECT agent_id FROM posts WHERE id = $1`, [postId]);
    if (postExists.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Post not found" });
    }
    const postOwnerAgentId = postExists.rows[0].agent_id;

    let parentId = null;
    if (typeof parent_comment_id === "string" && parent_comment_id.length > 0) {
      const parent = await client.query(
        `SELECT id FROM post_comments WHERE id = $1 AND post_id = $2`,
        [parent_comment_id, postId]
      );
      if (parent.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "parent_comment_id is invalid for this post" });
      }
      parentId = parent_comment_id;
    }

    const inserted = await client.query(
      `INSERT INTO post_comments (post_id, agent_id, parent_comment_id, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, post_id, agent_id, parent_comment_id, content, created_at`,
      [postId, actorAgentId, parentId, content]
    );

    if (postOwnerAgentId && postOwnerAgentId !== actorAgentId) {
      await client.query(
        `INSERT INTO notifications (agent_id, type, actor_agent_id, entity_type, entity_id)
         SELECT $1, 'comment', $2, 'post', $3
         WHERE NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.agent_id = $1 AND n.type = 'comment' AND n.actor_agent_id = $2
             AND n.entity_type = 'post' AND n.entity_id = $3
             AND n.created_at > now() - interval '10 minutes'
         )`,
        [postOwnerAgentId, actorAgentId, postId]
      );
    }

    await client.query("COMMIT");
    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    next(err);
  } finally {
    client.release();
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

    // Like endpoint is unauthenticated; emit a notification without an actor.
    try {
      const ownerRes = await pool.query(`SELECT agent_id FROM posts WHERE id = $1`, [id]);
      const ownerId = ownerRes.rows[0]?.agent_id;
      if (ownerId) {
        await pool.query(
          `INSERT INTO notifications (agent_id, type, actor_agent_id, entity_type, entity_id)
           SELECT $1, 'like', NULL, 'post', $2
           WHERE NOT EXISTS (
             SELECT 1 FROM notifications n
             WHERE n.agent_id = $1 AND n.type = 'like' AND n.actor_agent_id IS NULL
               AND n.entity_type = 'post' AND n.entity_id = $2
               AND n.created_at > now() - interval '2 minutes'
           )`,
          [ownerId, id]
        );
      }
    } catch (_) {
      // Best-effort only.
    }

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

  // Notify the owner of the referenced post.
  try {
    const ownerRes = await client.query(`SELECT agent_id FROM posts WHERE id = $1`, [targetPostId]);
    const ownerId = ownerRes.rows[0]?.agent_id;
    if (ownerId && ownerId !== actorAgentId) {
      await client.query(
        `INSERT INTO notifications (agent_id, type, actor_agent_id, entity_type, entity_id)
         SELECT $1, $2, $3, 'post', $4
         WHERE NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.agent_id = $1 AND n.type = $2 AND n.actor_agent_id = $3
             AND n.entity_type = 'post' AND n.entity_id = $4
             AND n.created_at > now() - interval '10 minutes'
         )`,
        [ownerId, kind, actorAgentId, targetPostId]
      );
    }
  } catch (_) {
    // Best-effort.
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
