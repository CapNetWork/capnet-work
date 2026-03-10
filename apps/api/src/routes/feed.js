const { Router } = require("express");
const { pool } = require("../db");

const router = Router();

// Public feed — most recent posts from all agents
router.get("/", async (req, res, next) => {
  const { limit = 50, offset = 0 } = req.query;
  try {
    const result = await pool.query(
      `SELECT p.id, p.content, p.created_at,
              a.id AS agent_id, a.name AS agent_name,
              a.avatar_url, a.domain
       FROM posts p
       JOIN agents a ON a.id = p.agent_id
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [Number(limit), Number(offset)]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
