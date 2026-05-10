const { Router } = require("express");
const { pool } = require("../db");
const { authenticateAgent, authenticateBySessionOrKey } = require("../middleware/auth");
const { rewardAdminOrAgent, requireRewardAdmin } = require("../middleware/reward-auth");
const bankrIntegration = require("../integrations/providers/bankr");
const { processPostRewards } = require("../services/reward-pipeline");
const { runAgentSettlement } = require("../services/agent-settlement");
const privyDriver = require("../lib/drivers/privy");
const rewardCfg = require("../config/rewards");

const router = Router();

function solanaTxExplorerUrl(txHash) {
  const h = String(txHash || "").trim();
  if (!h) return null;
  const cluster = privyDriver.getSolanaCluster() ? String(privyDriver.getSolanaCluster()) : "mainnet-beta";
  const q =
    cluster === "mainnet-beta" || cluster === "mainnet" ? "" : `?cluster=${encodeURIComponent(cluster)}`;
  return `https://explorer.solana.com/tx/${encodeURIComponent(h)}${q}`;
}

const SOLANA_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function assertOwnAgent(req, agentId) {
  if (agentId !== req.agent?.id) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
}

router.post("/bankr/connect", authenticateAgent, async (req, res, next) => {
  try {
    // Backward-compat shim: canonical route is POST /integrations/bankr/connect.
    const body = await bankrIntegration.connect(req.agent.id, req.body?.bankr_api_key);
    res.json(body);
  } catch (err) {
    if (typeof bankrIntegration.mapConnectError === "function") {
      const mapped = bankrIntegration.mapConnectError(err);
      if (mapped) return res.status(mapped.status || 400).json({ error: mapped.error });
    }
    next(err);
  }
});

router.get("/bankr/status", authenticateAgent, async (req, res, next) => {
  try {
    const s = await bankrIntegration.getIntegrationStatus(req.agent.id);
    if (!s.connected) {
      return res.json({ connected: false, connection_status: "disconnected" });
    }
    return res.json({ connected: true, ...s.config });
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
    const summary = await runAgentSettlement();
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
    let settlementReadyQ = { rows: [{ primary_payout_ready: 0 }] };
    try {
      settlementReadyQ = await pool.query(
        `SELECT COUNT(*)::int AS primary_payout_ready
         FROM agent_payout_wallets
         WHERE chain = 'solana' AND is_primary IS TRUE`
      );
    } catch (e) {
      if (e.code !== "42P01") throw e;
    }
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
        agents_with_primary_solana_payout: settlementReadyQ.rows[0]?.primary_payout_ready ?? 0,
        agents_with_pending: pendingQ.rows[0]?.agents_with_pending ?? 0,
        total_pending_liability: Number(totalPending.toFixed(6)),
        paid_today: Number(paidToday.toFixed(6)),
        max_daily_payout_throughput: Number(maxDailyThroughput.toFixed(6)),
        projected_tomorrow_max_outflow: Number(projectedTomorrowMax.toFixed(6)),
      },
      note:
        "Projected tomorrow max outflow is conservative (pending unsettled earnings plus capped settlement throughput per day). Settlement uses Solana native SOL via Privy treasury, not Bankr.",
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
    let payoutWallets = { rows: [] };
    try {
      payoutWallets = await pool.query(
        `SELECT id, chain, wallet_address, wallet_provider, is_primary, created_at, updated_at
         FROM agent_payout_wallets
         WHERE agent_id = $1
         ORDER BY is_primary DESC, created_at DESC`,
        [agentId]
      );
    } catch (e) {
      if (!String(e.message || "").includes("agent_payout_wallets")) throw e;
    }

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
              status, tx_hash, created_at, settlement_kind, settlement_note
       FROM reward_payouts
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [agentId]
    );

    const settlement_proof = payouts.rows.map((p) => ({
      ...p,
      explorer_url: p.tx_hash ? solanaTxExplorerUrl(p.tx_hash) : null,
      payout_reason: p.settlement_note || "unsettled_earnings_batch",
      settlement_kind: p.settlement_kind || "unsettled_earnings",
    }));

    res.json({
      balance: balance.rows[0] || { pending_balance: 0, paid_balance: 0, last_payout_at: null },
      payout_wallets: payoutWallets.rows,
      settlements: settlement_proof,
      earnings_today: earnedToday.rows[0]?.s ?? 0,
      leaderboard_rank: rankRow.rows[0]?.rank ?? null,
      recent_post_scores: perPost.rows,
      /** @deprecated renamed to settlements — settlement proof receipts */
      recent_payouts: settlement_proof,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/agents/:agentId/payout-wallets", authenticateBySessionOrKey, async (req, res, next) => {
  try {
    assertOwnAgent(req, req.params.agentId);
    const r = await pool.query(
      `SELECT id, chain, wallet_address, wallet_provider, is_primary, created_at, updated_at
       FROM agent_payout_wallets WHERE agent_id = $1 ORDER BY is_primary DESC, created_at DESC`,
      [req.params.agentId]
    );
    res.json({ wallets: r.rows });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

router.post("/agents/:agentId/payout-wallets", authenticateBySessionOrKey, async (req, res, next) => {
  try {
    assertOwnAgent(req, req.params.agentId);
    const agentId = req.params.agentId;
    const wallet_address =
      typeof req.body?.wallet_address === "string" ? req.body.wallet_address.trim() : "";
    const wallet_provider =
      typeof req.body?.wallet_provider === "string" ? req.body.wallet_provider.trim().toLowerCase() : "";
    if (!SOLANA_ADDR_RE.test(wallet_address)) {
      return res.status(400).json({ error: "wallet_address must be a valid Solana public key (base58)" });
    }
    if (!["privy", "phantom", "external"].includes(wallet_provider)) {
      return res.status(400).json({
        error: "wallet_provider must be one of: privy, phantom, external",
      });
    }
    if (wallet_provider === "privy") {
      const pr = await pool.query(
        `SELECT wallet_address FROM agent_wallets
         WHERE agent_id = $1 AND chain_type = 'solana' AND custody_type = 'privy'
         ORDER BY linked_at DESC LIMIT 1`,
        [agentId]
      );
      if (!pr.rows[0] || pr.rows[0].wallet_address !== wallet_address) {
        return res.status(400).json({
          error: "For provider privy, wallet_address must equal the linked Privy Solana wallet.",
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE agent_payout_wallets SET is_primary = FALSE, updated_at = now()
         WHERE agent_id = $1 AND chain = 'solana'`,
        [agentId]
      );
      const ins = await client.query(
        `INSERT INTO agent_payout_wallets (agent_id, chain, wallet_address, wallet_provider, is_primary)
         VALUES ($1, 'solana', $2, $3, TRUE)
         ON CONFLICT (agent_id, chain, wallet_address)
         DO UPDATE SET is_primary = TRUE, wallet_provider = EXCLUDED.wallet_provider, updated_at = now()
         RETURNING id, chain, wallet_address, wallet_provider, is_primary, created_at, updated_at`,
        [agentId, wallet_address, wallet_provider]
      );
      await client.query("COMMIT");
      res.status(201).json({ wallet: ins.rows[0] });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
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
