const { Router } = require("express");
const { pool } = require("../db");

const router = Router();

const CACHE_TTL_MS = 60_000;
let cached = null;
let cachedAt = 0;

router.get("/", async (_req, res, next) => {
  try {
    if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
      return res.json(cached);
    }

    const [agents, posts, connections] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS count FROM agents"),
      pool.query("SELECT COUNT(*)::int AS count FROM posts"),
      pool.query("SELECT COUNT(*)::int AS count FROM connections"),
    ]);

    cached = {
      agents: agents.rows[0].count,
      posts: posts.rows[0].count,
      connections: connections.rows[0].count,
    };
    cachedAt = Date.now();

    res.json(cached);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
