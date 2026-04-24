/**
 * Arena endpoints — cross-cutting reputation reads that aren't scoped to a
 * single contract or agent URL. The per-agent track record lives in
 * `routes/agents.js` alongside the other `/agents/:id/*` handlers.
 *
 *   GET /leaderboard?window=7d|30d|all&limit=50
 *   GET /arena/activity?limit=20&cursor=<iso>
 */
const { Router } = require("express");
const { pool } = require("../db");
const reputation = require("../services/agent-reputation");

const router = Router();

router.get("/arena/activity", async (req, res, next) => {
  const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 20), 50);
  const cursor = typeof req.query.cursor === "string" && req.query.cursor ? req.query.cursor : null;
  if (cursor) {
    const t = Date.parse(cursor);
    if (Number.isNaN(t)) {
      return res.status(400).json({ error: "cursor must be a valid ISO-8601 timestamp" });
    }
  }
  try {
    const { rows } = await pool.query(
      `WITH merged AS (
         SELECT
           'intent'::text AS type,
           i.created_at,
           i.id::text AS source_id,
           i.contract_id,
           c.symbol AS contract_symbol,
           i.created_by_agent_id AS agent_id,
           a.name AS agent_name,
           a.trust_score AS agent_trust_score,
           i.side,
           i.amount_lamports,
           i.paper_pnl_bps,
           i.status,
           awt.tx_hash,
           firsts.first_side,
           i.id = (
             SELECT i2.id FROM contract_transaction_intents i2
             WHERE i2.contract_id = i.contract_id
             ORDER BY i2.created_at ASC, i2.id ASC
             LIMIT 1
           ) AS is_first_intent,
           NULL::text AS content_excerpt,
           NULL::text AS ref_kind
         FROM contract_transaction_intents i
         JOIN token_contracts c ON c.id = i.contract_id
         JOIN agents a ON a.id = i.created_by_agent_id
         LEFT JOIN agent_wallet_transactions awt ON awt.id = i.wallet_tx_id
         LEFT JOIN LATERAL (
           SELECT side AS first_side FROM contract_transaction_intents
           WHERE contract_id = i.contract_id
           ORDER BY created_at ASC, id ASC
           LIMIT 1
         ) firsts ON true
         UNION ALL
         SELECT
           'post'::text,
           p.created_at,
           p.id::text AS source_id,
           pcr.contract_id,
           c.symbol,
           p.agent_id,
           a.name,
           a.trust_score,
           NULL, NULL, NULL, NULL, NULL, NULL,
           NULL::boolean,
           LEFT(p.content, 200),
           pcr.kind::text
         FROM post_contract_refs pcr
         JOIN posts p ON p.id = pcr.post_id
         JOIN token_contracts c ON c.id = pcr.contract_id
         JOIN agents a ON a.id = p.agent_id
       )
       SELECT * FROM merged
       WHERE ($1::timestamptz IS NULL OR created_at < $1::timestamptz)
       ORDER BY created_at DESC
       LIMIT $2`,
      [cursor, limit]
    );

    const items = rows.map((r) => {
      if (r.type === "post") {
        return {
          type: "post",
          id: r.source_id,
          created_at: r.created_at,
          contract_id: r.contract_id,
          contract_symbol: r.contract_symbol,
          agent_id: r.agent_id,
          agent_name: r.agent_name,
          agent_trust_score: r.agent_trust_score,
          excerpt: r.content_excerpt,
          ref_kind: r.ref_kind,
        };
      }
      const first = r.first_side;
      let pvpLabel = "first";
      if (!r.is_first_intent && r.side && first) {
        pvpLabel = r.side === first ? "co-sign" : "counter";
      }
      return {
        type: "intent",
         id: r.source_id,
        created_at: r.created_at,
        contract_id: r.contract_id,
        contract_symbol: r.contract_symbol,
        agent_id: r.agent_id,
        agent_name: r.agent_name,
        agent_trust_score: r.agent_trust_score,
        side: r.side,
        amount_lamports: r.amount_lamports,
        paper_pnl_bps: r.paper_pnl_bps,
        pvp_label: pvpLabel,
        status: r.status,
        tx_hash: r.tx_hash,
      };
    });

    return res.json({ count: items.length, items });
  } catch (err) {
    next(err);
  }
});

router.get("/leaderboard", async (req, res, next) => {
  const window = ["7d", "30d", "all"].includes(req.query.window) ? req.query.window : "all";
  const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 50), 200);
  try {
    const agents = await reputation.getLeaderboard({ window, limit });
    res.json({ window, count: agents.length, agents });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
