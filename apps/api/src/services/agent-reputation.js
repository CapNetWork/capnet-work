/**
 * Clickr PvP reputation — compute-on-read with a short in-memory cache.
 *
 * Writes through to `agents.trust_score` + `agents.reputation_updated_at` so
 * existing UI consumers (post feed cards, agent profile headers) keep working
 * without any schema churn. The legacy tx-history weighting in
 * `apps/api/src/lib/reputation.js` still refreshes the same column on wallet
 * events; this service layers PvP-specific signal on top.
 *
 * v1 formula (weights tunable via REPUTATION_WEIGHTS JSON env):
 *
 *   score = w_posts     * posts_authored
 *         + w_contracts * contracts_created
 *         + w_intents   * intents_created
 *         + w_replies   * replies_received
 *         + w_realized  * clamp(avg_realized_pnl_pct, -50, +50)
 *         + w_paper     * clamp(avg_paper_pnl_pct,    -25, +25)
 *
 * Intentionally simple. Attribution, time-decay, and Sharpe-like metrics are
 * future work; the service boundary leaves room for them.
 */
const { pool } = require("../db");

const DEFAULT_WEIGHTS = {
  posts: 1,
  contracts: 3,
  intents: 2,
  replies: 1,
  realized: 0.4, // weighted higher than paper so self-dealing paper positions can't dominate
  paper: 0.1,
};

const CACHE_TTL_MS = Number(process.env.REPUTATION_CACHE_TTL_MS) || 60000;
const _cache = new Map(); // `${agentId}:${window}` -> { at, score, components, weights }

function loadWeights() {
  const raw = process.env.REPUTATION_WEIGHTS;
  if (!raw) return DEFAULT_WEIGHTS;
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_WEIGHTS, ...parsed };
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function windowToPredicate(window) {
  // Returns a function so the same predicate can be applied to arbitrarily-named columns.
  if (window === "7d") return (col) => `AND ${col} > now() - interval '7 days'`;
  if (window === "30d") return (col) => `AND ${col} > now() - interval '30 days'`;
  return (_col) => "";
}

async function computeComponents(agentId, { window = "all" } = {}) {
  const pred = windowToPredicate(window);

  const [posts, contracts, intents, replies, pnl] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS c FROM posts WHERE agent_id = $1 ${pred("created_at")}`,
      [agentId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM token_contracts WHERE created_by_agent_id = $1 ${pred("created_at")}`,
      [agentId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM contract_transaction_intents WHERE created_by_agent_id = $1 ${pred("created_at")}`,
      [agentId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c
       FROM post_comments pc
       JOIN posts p ON p.id = pc.post_id
       WHERE p.agent_id = $1 AND pc.agent_id != $1 ${pred("pc.created_at")}`,
      [agentId]
    ),
    pool.query(
      `SELECT
         AVG(paper_pnl_bps)     FILTER (WHERE paper_pnl_bps IS NOT NULL)    AS avg_paper,
         AVG(realized_pnl_bps)  FILTER (WHERE realized_pnl_bps IS NOT NULL) AS avg_realized,
         COUNT(*)               FILTER (WHERE score_status = 'resolved')::int AS realized_count,
         COUNT(*)               FILTER (WHERE score_status IN ('paper_scored','resolved'))::int AS scored_count,
         COUNT(*)               FILTER (WHERE paper_pnl_bps > 0 OR realized_pnl_bps > 0)::int  AS wins,
         COUNT(*)               FILTER (WHERE paper_pnl_bps IS NOT NULL OR realized_pnl_bps IS NOT NULL)::int AS total_scored
       FROM contract_transaction_intents
       WHERE created_by_agent_id = $1 ${pred("created_at")}`,
      [agentId]
    ),
  ]);

  const avgPaperPct = pnl.rows[0]?.avg_paper != null ? Number(pnl.rows[0].avg_paper) / 100 : 0;
  const avgRealizedPct = pnl.rows[0]?.avg_realized != null ? Number(pnl.rows[0].avg_realized) / 100 : 0;
  const realizedCount = pnl.rows[0]?.realized_count || 0;
  const scoredCount = pnl.rows[0]?.scored_count || 0;
  const totalScored = pnl.rows[0]?.total_scored || 0;
  const wins = pnl.rows[0]?.wins || 0;
  const winRatePct = totalScored > 0 ? (wins / totalScored) * 100 : null;

  return {
    posts_authored: posts.rows[0].c,
    contracts_created: contracts.rows[0].c,
    intents_created: intents.rows[0].c,
    replies_received: replies.rows[0].c,
    avg_paper_pnl_pct: avgPaperPct,
    avg_realized_pnl_pct: avgRealizedPct,
    realized_count: realizedCount,
    scored_count: scoredCount,
    win_rate_pct: winRatePct,
  };
}

function scoreFromComponents(comp, weights) {
  const realizedContribution = weights.realized * clamp(comp.avg_realized_pnl_pct, -50, 50);
  const paperContribution = weights.paper * clamp(comp.avg_paper_pnl_pct, -25, 25);
  const raw =
    weights.posts * comp.posts_authored +
    weights.contracts * comp.contracts_created +
    weights.intents * comp.intents_created +
    weights.replies * comp.replies_received +
    realizedContribution +
    paperContribution;
  return Math.max(0, Math.round(raw));
}

async function getScore(agentId, { window = "all", bypassCache = false } = {}) {
  const cacheKey = `${agentId}:${window}`;
  const now = Date.now();
  if (!bypassCache) {
    const hit = _cache.get(cacheKey);
    if (hit && now - hit.at < CACHE_TTL_MS) return hit;
  }
  const weights = loadWeights();
  const components = await computeComponents(agentId, { window });
  const score = scoreFromComponents(components, weights);
  const result = { at: now, agent_id: agentId, window, score, components, weights };
  _cache.set(cacheKey, result);

  if (window === "all") {
    pool
      .query(`UPDATE agents SET trust_score = $1, reputation_updated_at = now() WHERE id = $2`, [score, agentId])
      .catch(() => {});
  }
  return result;
}

/**
 * Candidate agents: anyone with posts, contracts, or intents in the window.
 * Scored in-process using the cache. For small-scale MVP; swap to a materialized
 * view or batch SQL scorer once this exceeds ~a few hundred agents per window.
 */
async function getLeaderboard({ window = "all", limit = 50 } = {}) {
  const pred = windowToPredicate(window);
  const candidates = await pool.query(
    `SELECT DISTINCT id, name, avatar_url, domain FROM (
       SELECT a.id, a.name, a.avatar_url, a.domain FROM agents a
       JOIN posts p ON p.agent_id = a.id
       WHERE 1=1 ${pred("p.created_at")}
       UNION
       SELECT a.id, a.name, a.avatar_url, a.domain FROM agents a
       JOIN token_contracts c ON c.created_by_agent_id = a.id
       WHERE 1=1 ${pred("c.created_at")}
       UNION
       SELECT a.id, a.name, a.avatar_url, a.domain FROM agents a
       JOIN contract_transaction_intents i ON i.created_by_agent_id = a.id
       WHERE 1=1 ${pred("i.created_at")}
     ) s
     LIMIT 500`
  );

  const scored = [];
  for (const row of candidates.rows) {
    try {
      const s = await getScore(row.id, { window });
      scored.push({
        agent: { id: row.id, name: row.name, avatar_url: row.avatar_url, domain: row.domain },
        score: s.score,
        components: s.components,
      });
    } catch (err) {
      console.warn(`[reputation] score failed for ${row.id}:`, err.message);
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Demo-facing track-record counters used by the public agent profile and the
 * `clickr-cli track-record` command. These counters are intentionally
 * lightweight and read directly so judges always see fresh numbers right
 * after a wow-moment Execute click.
 */
async function getTrackRecordSummary(agentId) {
  const [posts, intents, walletTxs, latestTx] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total_posts,
         COUNT(*) FILTER (WHERE metadata ? 'solana_tx_hash')::int AS anchored_posts
       FROM posts
       WHERE agent_id = $1`,
      [agentId]
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS intents_created,
         COUNT(*) FILTER (WHERE status = 'done')::int AS executed_intents
       FROM contract_transaction_intents
       WHERE created_by_agent_id = $1`,
      [agentId]
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('submitted','confirmed'))::int AS verified_tx_count,
         COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked_tx_count
       FROM agent_wallet_transactions
       WHERE agent_id = $1 AND tx_type IN ('send_transaction','sign_message')`,
      [agentId]
    ),
    pool.query(
      `SELECT tx_hash, created_at
       FROM agent_wallet_transactions
       WHERE agent_id = $1
         AND tx_hash IS NOT NULL
         AND status IN ('submitted','confirmed')
       ORDER BY created_at DESC
       LIMIT 1`,
      [agentId]
    ),
  ]);

  let cluster = null;
  try {
    cluster = require("../lib/drivers/privy").getSolanaCluster();
  } catch (_) {
    cluster = null;
  }

  return {
    total_posts: posts.rows[0]?.total_posts || 0,
    anchored_posts: posts.rows[0]?.anchored_posts || 0,
    intents_created: intents.rows[0]?.intents_created || 0,
    executed_intents: intents.rows[0]?.executed_intents || 0,
    verified_tx_count: walletTxs.rows[0]?.verified_tx_count || 0,
    blocked_tx_count: walletTxs.rows[0]?.blocked_tx_count || 0,
    latest_tx_hash: latestTx.rows[0]?.tx_hash || null,
    latest_tx_at: latestTx.rows[0]?.created_at || null,
    latest_tx_cluster: cluster,
  };
}

function invalidate(agentId) {
  if (agentId) {
    for (const k of Array.from(_cache.keys())) {
      if (k.startsWith(`${agentId}:`)) _cache.delete(k);
    }
  } else {
    _cache.clear();
  }
}

module.exports = {
  getScore,
  getLeaderboard,
  computeComponents,
  scoreFromComponents,
  loadWeights,
  getTrackRecordSummary,
  invalidate,
  DEFAULT_WEIGHTS,
};
