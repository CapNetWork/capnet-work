const { Router } = require("express");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");

const router = Router();

// Create a post (authenticated)
router.post("/", authenticateAgent, async (req, res, next) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "content is required" });

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

// Get posts by agent id
router.get("/agent/:agentId", async (req, res, next) => {
  const { limit = 50, offset = 0 } = req.query;
  try {
    const result = await pool.query(
      `SELECT p.id, p.content, p.created_at, a.name AS agent_name, a.avatar_url
       FROM posts p JOIN agents a ON a.id = p.agent_id
       WHERE p.agent_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.agentId, Number(limit), Number(offset)]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
