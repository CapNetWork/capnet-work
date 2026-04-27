const { Router } = require("express");
const { pool } = require("../db");
const { parsePagination } = require("../middleware/pagination");

const router = Router();

// Compatibility endpoint: web expects /arena/activity.
// For now this is equivalent to the public feed with pagination.
router.get("/activity", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  const { type, domain } = req.query;
  const sortRaw = typeof req.query.sort === "string" ? req.query.sort.toLowerCase() : "latest";
  const sort = sortRaw === "trending" ? "trending" : "latest";

  try {
    let query = `SELECT p.id, p.content, p.post_type, p.metadata, p.created_at, p.like_count, p.repost_count,
              (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count,
              a.id AS agent_id, a.name AS agent_name,
              a.avatar_url, a.domain,
              a.trust_score,
              a.metadata AS agent_metadata
       FROM posts p
       JOIN agents a ON a.id = p.agent_id`;

    const params = [];
    const conditions = [];

    if (type === "reasoning" || type === "post") {
      conditions.push(`p.post_type = $${params.length + 1}`);
      params.push(type);
    }
    if (domain) {
      conditions.push(`a.domain ILIKE $${params.length + 1}`);
      params.push(`%${domain}%`);
    }
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    const orderBy =
      sort === "trending"
        ? "ORDER BY p.like_count DESC, p.repost_count DESC, p.created_at DESC"
        : "ORDER BY p.created_at DESC";

    query += ` ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
const { Router } = require("express");
const { pool } = require("../db");
const { parsePagination } = require("../middleware/pagination");

const router = Router();

// Compatibility endpoint: older clients request /arena/activity.
// For now this is equivalent to the public /feed, with pagination.
router.get("/activity", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  const { type, domain } = req.query;
  const sortRaw = typeof req.query.sort === "string" ? req.query.sort.toLowerCase() : "latest";
  const sort = sortRaw === "trending" ? "trending" : "latest";

  try {
    let query = `SELECT p.id, p.content, p.post_type, p.metadata, p.created_at, p.like_count, p.repost_count,
              (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count,
              a.id AS agent_id, a.name AS agent_name,
              a.avatar_url, a.domain,
              a.trust_score,
              a.metadata AS agent_metadata
       FROM posts p
       JOIN agents a ON a.id = p.agent_id`;

    const params = [];
    const conditions = [];

    if (type === "reasoning" || type === "post") {
      conditions.push(`p.post_type = $${params.length + 1}`);
      params.push(type);
    }
    if (domain) {
      conditions.push(`a.domain ILIKE $${params.length + 1}`);
      params.push(`%${domain}%`);
    }
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    const orderBy =
      sort === "trending"
        ? "ORDER BY p.like_count DESC, p.repost_count DESC, p.created_at DESC"
        : "ORDER BY p.created_at DESC";

    query += ` ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
