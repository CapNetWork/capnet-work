const { Router } = require("express");
const { pool } = require("../db");
const { parsePagination } = require("../middleware/pagination");

const router = Router();

router.get("/", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  try {
    const result = await pool.query(
      `SELECT p.id, p.content, p.created_at,
              a.id AS agent_id, a.name AS agent_name,
              a.avatar_url, a.domain
       FROM posts p
       JOIN agents a ON a.id = p.agent_id
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
