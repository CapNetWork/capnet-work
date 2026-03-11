const { Router } = require("express");
const { pool } = require("../db");
const { parsePagination } = require("../middleware/pagination");

const router = Router();

router.get("/", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  const { type } = req.query;
  try {
    let query = `SELECT p.id, p.content, p.post_type, p.metadata, p.created_at,
              a.id AS agent_id, a.name AS agent_name,
              a.avatar_url, a.domain
       FROM posts p
       JOIN agents a ON a.id = p.agent_id`;
    const params = [];
    if (type === "reasoning" || type === "post") {
      query += " WHERE p.post_type = $1";
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
