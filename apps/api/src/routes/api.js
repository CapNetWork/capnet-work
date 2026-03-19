const { Router } = require("express");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");
const { rewardAdminOrAgent, requireRewardAdmin } = require("../middleware/reward-auth");
const { encryptUtf8 } = require("../lib/secret-crypto");
const { validateBankrAndResolveWallet } = require("../services/bankr-client");
const { processPostRewards } = require("../services/reward-pipeline");
const { runPayoutBatch } = require("../services/payout-batch");

const router = Router();

router.post("/bankr/connect", authenticateAgent, async (req, res, next) => {
  const { bankr_api_key } = req.body || {};
  if (!bankr_api_key || typeof bankr_api_key !== "string") {
    return res.status(400).json({ error: "bankr_api_key is required" });
  }
  const trimmed = bankr_api_key.trim();
  if (trimmed.length < 8) {
    return res.status(400).json({ error: "bank_api_key looks too short" });
  }

  try {
    const { wallet_address } = await validateBankrAndResolveWallet(trimmed);
    const enc = encryptUtf8(trimmed);
    await pool.query(
      `INSERT INTO agent_bankr_accounts (agent_id, wallet_address, api_key_encrypted, connection_status)
       VALUES ($1, $2, $3, 'connected')
       ON CONFLICT (agent_id) DO UPDATE SET
         wallet_address = EXCLUDED.wallet_address,
         api_key_encrypted = EXCLUDED.api_key_encrypted,
         connection_status = 'connected',
         updated_at = now()`,
      [req.agent.id, wallet_address, enc]
    );
    res.json({
      ok: true,
      wallet_address,
      connection_status: "connected",
    });
  } catch (err) {
    if (String(err.message || "").includes("BANKR_SECRET_ENCRYPTION_KEY")) {
      return res.status(503).json({ error: err.message });
    }
    next(err);
  }
});

async function assertMayScorePost(req, postId) {
  if (req.rewardAdmin) return;
  const r = await pool.query(`SELECT agent_id FROM posts WHERE id = $1`, [postId]);
  if (r.rows.length === 0) {
    const e = new Error("Post not found");
    e.status = 404;
    throw e;
  }
  if (r.rows[0].agent_id !== req.agent.id) {
    const e = new Error("Forbidden");
    e.status = 403;
    throw e;
  }
}

router.post("/posts/:id/score", rewardAdminOrAgent, async (req, res, next) => {
  const postId = req.params.id;
  try {
    await assertMayScorePost(req, postId);
    const result = await processPostRewards(postId);
    if (!result.ok) return res.status(404).json({ error: result.error });
    res.json(result);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

router.post("/rewards/process", rewardAdminOrAgent, async (req, res, next) => {
  const postId = req.body?.post_id;
  if (!postId || typeof postId !== "string") {
    return res.status(400).json({ error: "post_id is required" });
  }
  try {
    await assertMayScorePost(req, postId);
    const result = await processPostRewards(postId);
    if (!result.ok) return res.status(404).json({ error: result.error });
    res.json(result);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

router.post("/payouts/run", requireRewardAdmin, async (_req, res, next) => {
  try {
    const summary = await runPayoutBatch();
    res.json(summary);
  } catch (e) {
    next(e);
  }
});

router.get("/agents/:id/rewards", authenticateAgent, async (req, res, next) => {
  const agentId = req.params.id;
  if (agentId !== req.agent.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const balance = await pool.query(
      `SELECT pending_balance, paid_balance, last_payout_at, updated_at
       FROM agent_reward_balances WHERE agent_id = $1`,
      [agentId]
    );
    const bankr = await pool.query(
      `SELECT wallet_address, connection_status, created_at, updated_at
       FROM agent_bankr_accounts WHERE agent_id = $1`,
      [agentId]
    );

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const earnedToday = await pool.query(
      `SELECT COALESCE(SUM(final_reward), 0)::float AS s
       FROM post_reward_scores
       WHERE agent_id = $1 AND eligible = true AND created_at >= $2`,
      [agentId, todayStart.toISOString()]
    );

    const perPost = await pool.query(
      `SELECT post_id, score, final_reward, eligible, reason, created_at
       FROM post_reward_scores
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [agentId]
    );

    const rankRow = await pool.query(
      `WITH totals AS (
         SELECT agent_id, COALESCE(SUM(final_reward), 0)::float AS total
         FROM post_reward_scores
         WHERE eligible = true
         GROUP BY agent_id
       ),
       ranked AS (
         SELECT agent_id, RANK() OVER (ORDER BY total DESC) AS rank
         FROM totals
       )
       SELECT rank FROM ranked WHERE agent_id = $1`,
      [agentId]
    );

    const payouts = await pool.query(
      `SELECT id, amount, wallet_address, bankr_job_id, status, tx_hash, created_at
       FROM reward_payouts
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [agentId]
    );

    res.json({
      balance: balance.rows[0] || { pending_balance: 0, paid_balance: 0, last_payout_at: null },
      bankr: bankr.rows[0] || null,
      earnings_today: earnedToday.rows[0]?.s ?? 0,
      leaderboard_rank: rankRow.rows[0]?.rank ?? null,
      recent_post_rewards: perPost.rows,
      recent_payouts: payouts.rows,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/leaderboard/rewards", async (req, res, next) => {
  const type = req.query.type || "agents";
  try {
    if (type === "posts") {
      const r = await pool.query(
        `SELECT prs.post_id, prs.agent_id, prs.final_reward AS reward, prs.score, prs.created_at,
                a.name AS agent_name, p.content
         FROM post_reward_scores prs
         JOIN agents a ON a.id = prs.agent_id
         JOIN posts p ON p.id = prs.post_id
         WHERE prs.eligible = true AND prs.final_reward > 0
         ORDER BY prs.final_reward DESC, prs.score DESC
         LIMIT 50`
      );
      return res.json({ type: "posts", entries: r.rows });
    }

    if (type === "scores") {
      const r = await pool.query(
        `SELECT agent_id, COALESCE(SUM(score), 0)::float AS total_score,
                COALESCE(SUM(final_reward), 0)::float AS total_rewards
         FROM post_reward_scores
         WHERE eligible = true
         GROUP BY agent_id
         ORDER BY total_score DESC
         LIMIT 50`
      );
      const names = await pool.query(`SELECT id, name, avatar_url FROM agents`);
      const byId = Object.fromEntries(names.rows.map((x) => [x.id, x]));
      const entries = r.rows.map((row) => ({
        ...row,
        agent_name: byId[row.agent_id]?.name || null,
        avatar_url: byId[row.agent_id]?.avatar_url || null,
      }));
      return res.json({ type: "scores", entries });
    }

    const r = await pool.query(
      `SELECT agent_id, COALESCE(SUM(final_reward), 0)::float AS total_rewards
       FROM post_reward_scores
       WHERE eligible = true
       GROUP BY agent_id
       ORDER BY total_rewards DESC
       LIMIT 50`
    );
    const names = await pool.query(`SELECT id, name, avatar_url FROM agents`);
    const byId = Object.fromEntries(names.rows.map((x) => [x.id, x]));
    const entries = r.rows.map((row, i) => ({
      rank: i + 1,
      agent_id: row.agent_id,
      total_rewards: row.total_rewards,
      agent_name: byId[row.agent_id]?.name || null,
      avatar_url: byId[row.agent_id]?.avatar_url || null,
    }));
    res.json({ type: "agents", entries });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
