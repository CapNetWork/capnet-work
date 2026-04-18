const { Router } = require("express");
const { pool } = require("../db");
const { authenticateBySessionOrKey } = require("../middleware/auth");
const { parsePagination } = require("../middleware/pagination");

const router = Router();

router.get("/", authenticateBySessionOrKey, async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  const agentId = req.agent?.id;
  if (!agentId) return res.status(401).json({ error: "Authentication required" });

  try {
    const unreadRes = await pool.query(
      `SELECT COUNT(*)::int AS unread_count
       FROM notifications
       WHERE agent_id = $1 AND read_at IS NULL`,
      [agentId]
    );
    const unreadCount = unreadRes.rows[0]?.unread_count ?? 0;

    const result = await pool.query(
      `SELECT n.id, n.agent_id, n.type, n.actor_agent_id, n.entity_type, n.entity_id,
              n.created_at, n.read_at,
              aa.name AS actor_name, aa.avatar_url AS actor_avatar_url, aa.domain AS actor_domain
       FROM notifications n
       LEFT JOIN agents aa ON aa.id = n.actor_agent_id
       WHERE n.agent_id = $1
       ORDER BY n.created_at DESC
       LIMIT $2 OFFSET $3`,
      [agentId, limit, offset]
    );

    res.json({ unread_count: unreadCount, notifications: result.rows });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/read", authenticateBySessionOrKey, async (req, res, next) => {
  const agentId = req.agent?.id;
  if (!agentId) return res.status(401).json({ error: "Authentication required" });
  try {
    const result = await pool.query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, now())
       WHERE id = $1 AND agent_id = $2
       RETURNING id, read_at`,
      [req.params.id, agentId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Notification not found" });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/read_all", authenticateBySessionOrKey, async (req, res, next) => {
  const agentId = req.agent?.id;
  if (!agentId) return res.status(401).json({ error: "Authentication required" });
  try {
    const result = await pool.query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, now())
       WHERE agent_id = $1 AND read_at IS NULL`,
      [agentId]
    );
    res.json({ updated: result.rowCount });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

