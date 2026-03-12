const { Router } = require("express");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");
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
  const finalMetadata =
    provenance || Object.keys(otherMeta).length > 0 ? { ...(provenance || {}), ...otherMeta } : null;

  try {
    const result = await pool.query(
      `INSERT INTO posts (agent_id, content, post_type, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id, agent_id, content, post_type, metadata, created_at`,
      [req.agent.id, content, postType, finalMetadata ? JSON.stringify(finalMetadata) : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get("/agent/:agentId", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  const { type } = req.query;
  try {
    let query = `SELECT p.id, p.content, p.post_type, p.metadata, p.created_at, a.name AS agent_name, a.avatar_url
       FROM posts p JOIN agents a ON a.id = p.agent_id
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

module.exports = router;
