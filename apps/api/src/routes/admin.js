/**
 * Admin-scoped endpoints (small surface — one for now).
 *
 *   GET /admin/revenue      platform-fee rollup by day and by output mint
 *
 * Auth: session-or-key, plus CLICKR_ADMIN_ALLOWLIST (comma-separated agent/user IDs).
 * If the allowlist is empty this endpoint returns 503 so deploys don't accidentally
 * expose revenue numbers before someone has set up the allowlist.
 */
const { Router } = require("express");
const { pool } = require("../db");
const { authenticateBySessionOrKey } = require("../middleware/auth");

const router = Router();

function adminAllowlist() {
  return (process.env.CLICKR_ADMIN_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

router.get("/revenue", authenticateBySessionOrKey, async (req, res, next) => {
  const allowlist = adminAllowlist();
  if (allowlist.length === 0) {
    return res.status(503).json({
      error: "Admin allowlist not configured. Set CLICKR_ADMIN_ALLOWLIST to enable.",
    });
  }
  const userId = req.clickrUser?.id;
  const agentId = req.agent?.id;
  const allowed =
    (userId && allowlist.includes(userId)) || (agentId && allowlist.includes(agentId));
  if (!allowed) return res.status(403).json({ error: "Not in CLICKR_ADMIN_ALLOWLIST" });

  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 180);

    const totals = await pool.query(
      `SELECT
         COALESCE(SUM((i.platform_fee_amount_base_units)::numeric), 0)::text AS total_base_units,
         COUNT(*)::int AS intent_count,
         COUNT(DISTINCT i.platform_fee_mint) FILTER (WHERE i.platform_fee_mint IS NOT NULL)::int AS mint_count
       FROM contract_transaction_intents i
       JOIN agent_wallet_transactions awt ON awt.id = i.wallet_tx_id
       WHERE awt.status = 'confirmed'
         AND i.platform_fee_amount_base_units IS NOT NULL
         AND i.created_at > now() - make_interval(days => $1)`,
      [days]
    );

    const byDay = await pool.query(
      `SELECT
         date_trunc('day', i.created_at)::date AS day,
         i.platform_fee_mint AS mint,
         COALESCE(SUM((i.platform_fee_amount_base_units)::numeric), 0)::text AS base_units,
         COUNT(*)::int AS intent_count
       FROM contract_transaction_intents i
       JOIN agent_wallet_transactions awt ON awt.id = i.wallet_tx_id
       WHERE awt.status = 'confirmed'
         AND i.platform_fee_amount_base_units IS NOT NULL
         AND i.created_at > now() - make_interval(days => $1)
       GROUP BY 1, 2
       ORDER BY 1 DESC, 2`,
      [days]
    );

    const byMint = await pool.query(
      `SELECT
         i.platform_fee_mint AS mint,
         COALESCE(SUM((i.platform_fee_amount_base_units)::numeric), 0)::text AS base_units,
         COUNT(*)::int AS intent_count
       FROM contract_transaction_intents i
       JOIN agent_wallet_transactions awt ON awt.id = i.wallet_tx_id
       WHERE awt.status = 'confirmed'
         AND i.platform_fee_amount_base_units IS NOT NULL
         AND i.platform_fee_mint IS NOT NULL
         AND i.created_at > now() - make_interval(days => $1)
       GROUP BY 1
       ORDER BY intent_count DESC`,
      [days]
    );

    res.json({
      window_days: days,
      totals: totals.rows[0],
      by_day: byDay.rows,
      by_mint: byMint.rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
