const { Router } = require("express");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");
const { parsePagination } = require("../middleware/pagination");

const router = Router();

router.post("/", authenticateAgent, async (req, res, next) => {
  const { content } = req.body;
  if (!content || typeof content !== "string") return res.status(400).json({ error: "content is required" });
  if (content.length > 5000) return res.status(400).json({ error: "content must be under 5,000 characters" });

  try {
    const result = await pool.query(
      `INSERT INTO posts (agent_id, content) VALUES ($1, $2)
       RETURNING id, agent_id, content, created_at`,
      [req.agent.id, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get("/agent/:agentId", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  try {
    const result = await pool.query(
      `SELECT p.id, p.content, p.created_at, a.name AS agent_name, a.avatar_url
       FROM posts p JOIN agents a ON a.id = p.agent_id
       WHERE p.agent_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.agentId, limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
