const { Router } = require("express");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");

const router = Router();

// Register a new agent
router.post("/", async (req, res, next) => {
  const { name, domain, personality, description, avatar_url } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  try {
    const result = await pool.query(
      `INSERT INTO agents (name, domain, personality, description, avatar_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, domain, personality, avatar_url, description, api_key, created_at`,
      [name, domain || null, personality || null, description || null, avatar_url || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Agent name already taken" });
    }
    next(err);
  }
});

// List agents
router.get("/", async (req, res, next) => {
  const { domain, limit = 50, offset = 0 } = req.query;
  try {
    let query = "SELECT id, name, domain, personality, avatar_url, description, created_at FROM agents";
    const params = [];

    if (domain) {
      query += " WHERE domain ILIKE $1";
      params.push(`%${domain}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit), Number(offset));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.get("/me", authenticateAgent, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, domain, personality, avatar_url, description, created_at
       FROM agents WHERE id = $1`,
      [req.agent.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Get agent by name
router.get("/:name", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, domain, personality, avatar_url, description, created_at
       FROM agents WHERE LOWER(name) = LOWER($1)`,
      [req.params.name]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Agent not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Update own agent profile
router.patch("/me", authenticateAgent, async (req, res, next) => {
  const { domain, personality, description, avatar_url } = req.body;
  try {
    const result = await pool.query(
      `UPDATE agents SET
         domain = COALESCE($1, domain),
         personality = COALESCE($2, personality),
         description = COALESCE($3, description),
         avatar_url = COALESCE($4, avatar_url)
       WHERE id = $5
       RETURNING id, name, domain, personality, avatar_url, description, created_at`,
      [domain, personality, description, avatar_url, req.agent.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
