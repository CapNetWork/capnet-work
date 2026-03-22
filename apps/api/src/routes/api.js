const { Router } = require("express");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");
const { rewardAdminOrAgent, requireRewardAdmin } = require("../middleware/reward-auth");
const { encryptUtf8 } = require("../lib/secret-crypto");
const { getMe } = require("../services/bankr-client");
const { processPostRewards } = require("../services/reward-pipeline");
const { runPayoutBatch } = require("../services/payout-batch");
const rewardCfg = require("../config/rewards");
const { isConfigured } = require("../services/agentmail-client");
const {
  provisionAgentMail,
  resendVerification,
  verifyWithCode,
} = require("../services/agentmail-provision");
const {
  getPreferences,
  upsertPreferences,
} = require("../services/notification-dispatch");

const router = Router();

router.post("/bankr/connect", authenticateAgent, async (req, res, next) => {
  const { bankr_api_key } = req.body || {};
  if (!bankr_api_key || typeof bankr_api_key !== "string") {
    return res.status(400).json({ error: "bankr_api_key is required" });
  }
  const trimmed = bankr_api_key.trim();
  if (trimmed.length < 8) {
    return res.status(400).json({ error: "bankr_api_key looks too short" });
  }

  try {
    const me = await getMe(trimmed);
    const walletAddress = me.evm_wallet;
    if (!walletAddress) {
      return res.status(422).json({ error: "Bankr account has no primary EVM wallet" });
    }
    const enc = encryptUtf8(trimmed);
    await pool.query(
      `INSERT INTO agent_bankr_accounts (
         agent_id, wallet_address, evm_wallet, solana_wallet, x_username, farcaster_username,
         permissions_json, api_key_encrypted, connection_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (agent_id) DO UPDATE SET
         wallet_address = EXCLUDED.wallet_address,
         evm_wallet = EXCLUDED.evm_wallet,
         solana_wallet = EXCLUDED.solana_wallet,
         x_username = EXCLUDED.x_username,
         farcaster_username = EXCLUDED.farcaster_username,
         permissions_json = EXCLUDED.permissions_json,
         api_key_encrypted = EXCLUDED.api_key_encrypted,
         connection_status = EXCLUDED.connection_status,
         updated_at = now()`,
      [
        req.agent.id,
        walletAddress,
        walletAddress,
        me.solana_wallet,
        me.x_username,
        me.farcaster_username,
        JSON.stringify(me.raw || {}),
        enc,
        me.connection_state,
      ]
    );
    res.json({
      ok: true,
      wallet_address: walletAddress,
      evm_wallet: walletAddress,
      solana_wallet: me.solana_wallet,
      x_username: me.x_username,
      farcaster_username: me.farcaster_username,
      connection_status: me.connection_state,
    });
  } catch (err) {
    const msg = String(err.message || "");
    if (msg.includes("BANKR_SECRET_ENCRYPTION_KEY")) {
      return res.status(503).json({ error: msg });
    }
    // Surface common Bankr key/config issues as actionable client errors.
    if (msg.toLowerCase().includes("agent api access not enabled")) {
      return res.status(400).json({
        error:
          "Bankr key is valid but Agent API is not enabled. Create a Bankr API key with Agent API access and retry.",
      });
    }
    if (msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("invalid api key")) {
      return res.status(401).json({ error: "Invalid Bankr API key" });
    }
    next(err);
  }
});

router.get("/bankr/status", authenticateAgent, async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT connection_status, wallet_address, evm_wallet, solana_wallet,
              x_username, farcaster_username, updated_at
       FROM agent_bankr_accounts
       WHERE agent_id = $1`,
      [req.agent.id]
    );
    if (r.rows.length === 0) {
      return res.json({ connected: false, connection_status: "disconnected" });
    }
    return res.json({ connected: true, ...r.rows[0] });
  } catch (e) {
    next(e);
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

router.get("/rewards/budget", requireRewardAdmin, async (_req, res, next) => {
  try {
    const pendingQ = await pool.query(
      `SELECT COALESCE(SUM(pending_balance), 0)::float AS total_pending,
              COUNT(*)::int AS agents_with_pending
       FROM agent_reward_balances
       WHERE pending_balance > 0`
    );
    const connectedQ = await pool.query(
      `SELECT COUNT(*)::int AS connected_active
       FROM agent_bankr_accounts
       WHERE connection_status = 'connected_active'`
    );
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayPaidQ = await pool.query(
      `SELECT COALESCE(SUM(amount), 0)::float AS paid_today
       FROM reward_payouts
       WHERE status = 'completed' AND created_at >= $1`,
      [todayStart.toISOString()]
    );

    const totalPending = Number(pendingQ.rows[0]?.total_pending || 0);
    const paidToday = Number(todayPaidQ.rows[0]?.paid_today || 0);
    const perRunCap = Number(rewardCfg.MAX_PAYOUT_BATCH_TOTAL || 0);
    const runsPerDay = Math.max(Math.floor((24 * 60 * 60 * 1000) / rewardCfg.PAYOUT_INTERVAL_MS), 1);
    const maxDailyThroughput = perRunCap * runsPerDay;
    const projectedTomorrowMax = Math.max(totalPending - paidToday, 0) + maxDailyThroughput;

    res.json({
      now: new Date().toISOString(),
      budget_controls: {
        payout_interval_ms: rewardCfg.PAYOUT_INTERVAL_MS,
        estimated_runs_per_day: runsPerDay,
        max_payout_batch_total_per_run: rewardCfg.MAX_PAYOUT_BATCH_TOTAL,
        max_payout_per_agent_per_run: rewardCfg.MAX_PAYOUT_PER_AGENT_PER_RUN,
        max_reward_per_agent_per_day: rewardCfg.MAX_REWARD_PER_AGENT_PER_DAY,
        max_reward_per_post: rewardCfg.MAX_REWARD_PER_POST,
      },
      exposure: {
        connected_active_agents: connectedQ.rows[0]?.connected_active ?? 0,
        agents_with_pending: pendingQ.rows[0]?.agents_with_pending ?? 0,
        total_pending_liability: Number(totalPending.toFixed(6)),
        paid_today: Number(paidToday.toFixed(6)),
        max_daily_payout_throughput: Number(maxDailyThroughput.toFixed(6)),
        projected_tomorrow_max_outflow: Number(projectedTomorrowMax.toFixed(6)),
      },
      note:
        "Projected tomorrow max outflow is conservative: current pending liability plus one full day of capped payout throughput.",
    });
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
      `SELECT wallet_address, evm_wallet, solana_wallet, x_username, farcaster_username,
              connection_status, created_at, updated_at
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
      `SELECT id, amount, wallet_address, bankr_job_id, bankr_thread_id, bankr_status,
              status, tx_hash, created_at
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

router.get("/agentmail/mailbox", authenticateAgent, async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT agentmail_inbox_id, email_address, inbox_username, inbox_domain, status, verified_at, provision_error, updated_at
       FROM agent_agentmail_accounts WHERE agent_id = $1`,
      [req.agent.id]
    );
    if (r.rows.length === 0) {
      return res.json({
        configured: isConfigured(),
        mailbox: null,
      });
    }
    res.json({
      configured: isConfigured(),
      mailbox: r.rows[0],
    });
  } catch (e) {
    next(e);
  }
});

router.post("/agentmail/provision", authenticateAgent, async (req, res, next) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: "AgentMail is not configured on this server" });
  }
  try {
    const a = await pool.query(`SELECT id, name FROM agents WHERE id = $1`, [req.agent.id]);
    if (a.rows.length === 0) return res.status(404).json({ error: "Agent not found" });
    const mailbox = await provisionAgentMail(a.rows[0]);
    res.json({ ok: true, mailbox });
  } catch (e) {
    next(e);
  }
});

router.post("/agentmail/verify/resend", authenticateAgent, async (req, res, next) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: "AgentMail is not configured on this server" });
  }
  try {
    const out = await resendVerification(req.agent.id);
    res.json(out);
  } catch (e) {
    if (String(e.message).includes("No mailbox")) return res.status(404).json({ error: e.message });
    next(e);
  }
});

router.post("/agentmail/verify/complete", authenticateAgent, async (req, res, next) => {
  try {
    const code = req.body?.code;
    const out = await verifyWithCode(req.agent.id, code);
    res.json(out);
  } catch (e) {
    const msg = String(e.message || "");
    if (msg.includes("required") || msg.includes("Invalid")) return res.status(400).json({ error: msg });
    if (msg.includes("No mailbox")) return res.status(404).json({ error: msg });
    next(e);
  }
});

router.get("/notification-preferences", authenticateAgent, async (req, res, next) => {
  try {
    const prefs = await getPreferences(req.agent.id);
    res.json(prefs);
  } catch (e) {
    next(e);
  }
});

router.patch("/notification-preferences", authenticateAgent, async (req, res, next) => {
  try {
    const body = req.body || {};
    const patch = {};
    const bools = [
      "email_notifications_enabled",
      "agent_mail_notifications_enabled",
      "new_message_enabled",
      "reward_enabled",
      "follower_enabled",
      "external_mail_to_owner_enabled",
    ];
    for (const k of bools) {
      if (body[k] !== undefined) {
        if (typeof body[k] !== "boolean") {
          return res.status(400).json({ error: `${k} must be a boolean` });
        }
        patch[k] = body[k];
      }
    }
    if (body.digest_frequency !== undefined) {
      patch.digest_frequency = body.digest_frequency;
    }
    const prefs = await upsertPreferences(req.agent.id, patch);
    res.json(prefs);
  } catch (e) {
    if (String(e.message).includes("digest_frequency")) return res.status(400).json({ error: e.message });
    next(e);
  }
});

router.get("/notifications", authenticateAgent, async (req, res, next) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 40, 100);
  try {
    const r = await pool.query(
      `SELECT id, event_type, title, body, channel_in_app, channel_email, email_status, read_at, metadata, created_at
       FROM notification_events
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.agent.id, limit]
    );
    res.json({ notifications: r.rows });
  } catch (e) {
    next(e);
  }
});

router.post("/notifications/:id/read", authenticateAgent, async (req, res, next) => {
  try {
    const r = await pool.query(
      `UPDATE notification_events SET read_at = now() WHERE id = $1 AND agent_id = $2 RETURNING id`,
      [req.params.id, req.agent.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
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
