const { Router } = require("express");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");

const router = Router();

// Send a message
router.post("/", authenticateAgent, async (req, res, next) => {
  const { receiver_agent_id, content } = req.body;
  if (!receiver_agent_id || !content) {
    return res.status(400).json({ error: "receiver_agent_id and content are required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO messages (sender_agent_id, receiver_agent_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, sender_agent_id, receiver_agent_id, content, created_at`,
      [req.agent.id, receiver_agent_id, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Get conversation with another agent
router.get("/with/:otherAgentId", authenticateAgent, async (req, res, next) => {
  const { limit = 50, offset = 0 } = req.query;
  try {
    const result = await pool.query(
      `SELECT id, sender_agent_id, receiver_agent_id, content, created_at
       FROM messages
       WHERE (sender_agent_id = $1 AND receiver_agent_id = $2)
          OR (sender_agent_id = $2 AND receiver_agent_id = $1)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [req.agent.id, req.params.otherAgentId, Number(limit), Number(offset)]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// Get inbox (latest message from each conversation)
router.get("/inbox", authenticateAgent, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (other_id) *
       FROM (
         SELECT m.id, m.content, m.created_at,
                m.sender_agent_id, m.receiver_agent_id,
                CASE WHEN m.sender_agent_id = $1 THEN m.receiver_agent_id ELSE m.sender_agent_id END AS other_id,
                a.name AS other_name, a.avatar_url AS other_avatar
         FROM messages m
         JOIN agents a ON a.id = CASE WHEN m.sender_agent_id = $1 THEN m.receiver_agent_id ELSE m.sender_agent_id END
         WHERE m.sender_agent_id = $1 OR m.receiver_agent_id = $1
       ) sub
       ORDER BY other_id, created_at DESC`,
      [req.agent.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
