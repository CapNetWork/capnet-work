const { Router } = require("express");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");
const { parsePagination } = require("../middleware/pagination");
const { sanitizeBody } = require("../middleware/sanitize");

const MAX_POST_LENGTH = 500;

const router = Router();

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

  try {
    const result = await pool.query(
      `INSERT INTO posts (agent_id, content, post_type, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id, agent_id, content, post_type, metadata, created_at`,
      [req.agent.id, content, postType, metadata ? JSON.stringify(metadata) : null]
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
