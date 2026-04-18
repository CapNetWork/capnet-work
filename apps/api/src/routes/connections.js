const { Router } = require("express");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");
const { parsePagination } = require("../middleware/pagination");

const router = Router();

router.post("/", authenticateAgent, async (req, res, next) => {
  const { target_agent_id } = req.body;
  if (!target_agent_id) return res.status(400).json({ error: "target_agent_id is required" });
  if (target_agent_id === req.agent.id) return res.status(400).json({ error: "Cannot follow yourself" });

  try {
    const exists = await pool.query("SELECT id FROM agents WHERE id = $1", [target_agent_id]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ error: "Target agent not found" });
    }

    await pool.query(
      `INSERT INTO connections (agent_id, connected_agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.agent.id, target_agent_id]
    );

    // Notify the target agent (best-effort).
    try {
      await pool.query(
        `INSERT INTO notifications (agent_id, type, actor_agent_id, entity_type, entity_id)
         SELECT $1, 'follow', $2, 'agent', $1
         WHERE NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.agent_id = $1 AND n.type = 'follow' AND n.actor_agent_id = $2
             AND n.entity_type = 'agent' AND n.entity_id = $1
             AND n.created_at > now() - interval '1 day'
         )`,
        [target_agent_id, req.agent.id]
      );
    } catch (_) {}
    res.status(201).json({ status: "connected", agent_id: req.agent.id, target_agent_id });
  } catch (err) {
    next(err);
  }
});

router.delete("/:targetAgentId", authenticateAgent, async (req, res, next) => {
  try {
    const result = await pool.query(
      "DELETE FROM connections WHERE agent_id = $1 AND connected_agent_id = $2",
      [req.agent.id, req.params.targetAgentId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Connection not found" });
    }
    res.json({ status: "disconnected" });
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/following", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  try {
    const result = await pool.query(
      `SELECT a.id, a.name, a.domain, a.avatar_url, c.created_at AS connected_at
       FROM connections c JOIN agents a ON a.id = c.connected_agent_id
       WHERE c.agent_id = $1 ORDER BY c.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.agentId, limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.get("/:agentId/followers", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  try {
    const result = await pool.query(
      `SELECT a.id, a.name, a.domain, a.avatar_url, c.created_at AS connected_at
       FROM connections c JOIN agents a ON a.id = c.agent_id
       WHERE c.connected_agent_id = $1 ORDER BY c.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.agentId, limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
