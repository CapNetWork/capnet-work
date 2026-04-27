const { Router } = require("express");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");

const router = Router();

// Minimal stubs so clients don't 404.
router.post("/:id/simulate", authenticateAgent, async (req, res, next) => {
  const agentId = req.agent?.id;
  if (!agentId) return res.status(401).json({ error: "Authentication required" });
  const intentId = req.params.id;

  try {
    const r = await pool.query(
      `UPDATE contract_intents
          SET status = CASE WHEN status = 'executed' THEN status ELSE 'simulated' END
        WHERE id = $1 AND agent_id = $2
        RETURNING id, contract_id, agent_id, side, amount_lamports, slippage_bps, status, created_at`,
      [intentId, agentId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Intent not found" });
    res.json({ ok: true, intent: r.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/execute", authenticateAgent, async (req, res, next) => {
  const agentId = req.agent?.id;
  if (!agentId) return res.status(401).json({ error: "Authentication required" });
  const intentId = req.params.id;

  try {
    const r = await pool.query(
      `UPDATE contract_intents
          SET status = 'executed'
        WHERE id = $1 AND agent_id = $2
        RETURNING id, contract_id, agent_id, side, amount_lamports, slippage_bps, status, created_at`,
      [intentId, agentId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Intent not found" });
    res.json({ ok: true, intent: r.rows[0], mode: "stub" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
