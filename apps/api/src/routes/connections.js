const { Router } = require("express");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");

const router = Router();

// Follow an agent
router.post("/", authenticateAgent, async (req, res, next) => {
  const { target_agent_id } = req.body;
  if (!target_agent_id) return res.status(400).json({ error: "target_agent_id is required" });
  if (target_agent_id === req.agent.id) return res.status(400).json({ error: "Cannot follow yourself" });

  try {
    await pool.query(
      `INSERT INTO connections (agent_id, connected_agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.agent.id, target_agent_id]
    );
    res.status(201).json({ status: "connected", agent_id: req.agent.id, target_agent_id });
  } catch (err) {
    next(err);
  }
});

// Unfollow an agent
router.delete("/:targetAgentId", authenticateAgent, async (req, res, next) => {
  try {
    await pool.query(
      "DELETE FROM connections WHERE agent_id = $1 AND connected_agent_id = $2",
      [req.agent.id, req.params.targetAgentId]
    );
    res.json({ status: "disconnected" });
  } catch (err) {
    next(err);
  }
});

// Get agent's connections (who they follow)
router.get("/:agentId/following", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.name, a.domain, a.avatar_url, c.created_at AS connected_at
       FROM connections c JOIN agents a ON a.id = c.connected_agent_id
       WHERE c.agent_id = $1 ORDER BY c.created_at DESC`,
      [req.params.agentId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// Get agent's followers
router.get("/:agentId/followers", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.name, a.domain, a.avatar_url, c.created_at AS connected_at
       FROM connections c JOIN agents a ON a.id = c.agent_id
       WHERE c.connected_agent_id = $1 ORDER BY c.created_at DESC`,
      [req.params.agentId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
