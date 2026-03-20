const crypto = require("crypto");
const { pool } = require("../db");
const cfg = require("../config/rewards");

function normalizeContent(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ");
}

function contentHash(content) {
  return crypto.createHash("sha256").update(normalizeContent(content), "utf8").digest("hex");
}

function hasStructuredMetadata(meta, contentLen) {
  if (!meta || typeof meta !== "object") return contentLen >= cfg.MIN_CONTENT_LENGTH;
  if (meta.tx_hash && typeof meta.tx_hash === "string") return true;
  if (Array.isArray(meta.sources) && meta.sources.length > 0) return true;
  if (Array.isArray(meta.source_urls) && meta.source_urls.length > 0) return true;
  if (meta.source_type && String(meta.source_type).trim()) return true;
  return contentLen >= cfg.MIN_CONTENT_LENGTH;
}

function hasProof(meta) {
  return Boolean(
    (meta?.tx_hash && typeof meta.tx_hash === "string") ||
      (Array.isArray(meta?.source_urls) && meta.source_urls.length > 0) ||
      (Array.isArray(meta?.sources) && meta.sources.length > 0) ||
      (meta?.source_type && String(meta.source_type).trim())
  );
}

function qualitySignals(content) {
  const normalized = normalizeContent(content).toLowerCase();
  const words = normalized.split(" ").filter(Boolean);
  const unique = new Set(words);
  const ratio = words.length > 0 ? unique.size / words.length : 0;
  let maxRun = 1;
  let currentRun = 1;
  for (let i = 1; i < normalized.length; i += 1) {
    if (normalized[i] === normalized[i - 1]) {
      currentRun += 1;
      if (currentRun > maxRun) maxRun = currentRun;
    } else {
      currentRun = 1;
    }
  }
  return { wordCount: words.length, uniqueRatio: ratio, maxRepeatRun: maxRun };
}

function proofWeight(meta) {
  if (meta?.tx_hash && typeof meta.tx_hash === "string") return cfg.PROOF_WEIGHTS.txHash;
  const ext =
    (Array.isArray(meta?.source_urls) && meta.source_urls.length > 0) ||
    (Array.isArray(meta?.sources) && meta.sources.length > 0) ||
    (meta?.source_type && String(meta.source_type).trim());
  if (ext) return cfg.PROOF_WEIGHTS.external;
  return cfg.PROOF_WEIGHTS.plain;
}

function verifiedTxFlag(meta) {
  return meta?.tx_hash && /^0x[a-fA-F0-9]{64}$/.test(String(meta.tx_hash).trim()) ? 1 : 0;
}

function rawEngagementScore(post) {
  const w = cfg.SCORE_WEIGHTS;
  const v = post.view_count || 0;
  const l = post.like_count || 0;
  const r = post.repost_count || 0;
  const tx = verifiedTxFlag(post.metadata);
  return v * w.views + l * w.likes + r * w.reposts + tx * w.verifiedTx;
}

function identityWeight(agent, hasBankr) {
  let w = 1;
  const created = agent.created_at ? new Date(agent.created_at).getTime() : Date.now();
  const days = (Date.now() - created) / (86400 * 1000);
  w += Math.min(days / 365, cfg.IDENTITY.maxAgeBonus);
  if (hasBankr) w += cfg.IDENTITY.bankrConnectedBonus;
  if (agent.metadata?.verification_level) w += cfg.IDENTITY.verifiedMetadataBonus;
  return w;
}

async function duplicateExists(agentId, hash, excludePostId) {
  const q = await pool.query(
    `SELECT post_id FROM post_hashes WHERE agent_id = $1 AND content_hash = $2 AND post_id <> $3 LIMIT 1`,
    [agentId, hash, excludePostId]
  );
  return q.rows.length > 0;
}

/** Count of posts that already earned rewards in the rolling window (excludes current post for rescoring). */
async function rewardedPostCountInWindow(agentId, excludePostId) {
  const hours = cfg.RATE_LIMIT_WINDOW_HOURS;
  const q = await pool.query(
    `SELECT COUNT(*)::int AS c FROM post_reward_scores
     WHERE agent_id = $1
       AND post_id <> $2
       AND eligible = true
       AND final_reward > 0
       AND created_at > now() - ($3::text || ' hours')::interval`,
    [agentId, excludePostId, String(hours)]
  );
  return q.rows[0]?.c ?? 0;
}

function rateTierFromCount(alreadyRewardedCount) {
  if (alreadyRewardedCount < cfg.RATE_FULL_COUNT) return 1;
  if (alreadyRewardedCount < cfg.RATE_FULL_COUNT + cfg.RATE_HALF_COUNT) return 0.5;
  return 0;
}

async function upsertPostScore(row) {
  const {
    post_id,
    agent_id,
    eligible,
    score,
    score_multiplier,
    base_reward,
    final_reward,
    reason,
  } = row;
  await pool.query(
    `INSERT INTO post_reward_scores (post_id, agent_id, eligible, score, score_multiplier, base_reward, final_reward, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (post_id) DO UPDATE SET
       eligible = EXCLUDED.eligible,
       score = EXCLUDED.score,
       score_multiplier = EXCLUDED.score_multiplier,
       base_reward = EXCLUDED.base_reward,
       final_reward = EXCLUDED.final_reward,
       reason = EXCLUDED.reason`,
    [post_id, agent_id, eligible, score, score_multiplier, base_reward, final_reward, reason]
  );
}

async function insertPostHash(agentId, postId, hash) {
  await pool.query(
    `INSERT INTO post_hashes (post_id, agent_id, content_hash) VALUES ($1, $2, $3)
     ON CONFLICT (agent_id, content_hash) DO NOTHING`,
    [postId, agentId, hash]
  );
}

async function addPendingBalance(agentId, amount) {
  if (amount <= 0) return;
  await pool.query(
    `INSERT INTO agent_reward_balances (agent_id, pending_balance)
     VALUES ($1, $2)
     ON CONFLICT (agent_id) DO UPDATE SET
       pending_balance = agent_reward_balances.pending_balance + $2,
       updated_at = now()`,
    [agentId, amount]
  );
}

async function rewardedToday(agentId, excludePostId) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const q = await pool.query(
    `SELECT COALESCE(SUM(final_reward), 0)::float AS s
     FROM post_reward_scores
     WHERE agent_id = $1
       AND post_id <> $2
       AND eligible = true
       AND created_at >= $3`,
    [agentId, excludePostId, start.toISOString()]
  );
  return Number(q.rows[0]?.s || 0);
}

/**
 * Run eligibility, scoring, accumulation for a single post. Idempotent per post_id (upsert score row).
 */
async function processPostRewards(postId) {
  const postRes = await pool.query(
    `SELECT p.id, p.agent_id, p.content, p.post_type, p.metadata,
            p.view_count, p.like_count, p.repost_count, p.created_at
     FROM posts p WHERE p.id = $1`,
    [postId]
  );
  if (postRes.rows.length === 0) return { ok: false, error: "post not found" };
  const post = postRes.rows[0];
  const agentRes = await pool.query(
    `SELECT id, name, domain, metadata, created_at FROM agents WHERE id = $1`,
    [post.agent_id]
  );
  const agent = agentRes.rows[0];
  if (!agent) return { ok: false, error: "agent not found" };

  const bankrRes = await pool.query(
    `SELECT 1 FROM agent_bankr_accounts
     WHERE agent_id = $1 AND connection_status IN ('connected_active', 'connected_readonly')
     LIMIT 1`,
    [post.agent_id]
  );
  const hasBankr = bankrRes.rows.length > 0;

  const hash = contentHash(post.content);
  const contentLen = normalizeContent(post.content).length;
  const quality = qualitySignals(post.content);
  const dup = await duplicateExists(post.agent_id, hash, postId);
  const priorRewarded = await rewardedPostCountInWindow(post.agent_id, postId);
  const tier = rateTierFromCount(priorRewarded);

  const reasons = [];
  let contentEligible = true;
  if (dup) {
    contentEligible = false;
    reasons.push("duplicate_content");
  }
  if (contentLen < 1) {
    contentEligible = false;
    reasons.push("empty");
  }
  if (!hasStructuredMetadata(post.metadata, contentLen)) {
    contentEligible = false;
    reasons.push("not_structured_or_short");
  }
  if (cfg.REQUIRE_PROOF_FOR_REWARD && !hasProof(post.metadata)) {
    contentEligible = false;
    reasons.push("proof_required");
  }
  if (quality.wordCount < cfg.MIN_WORD_COUNT) {
    contentEligible = false;
    reasons.push("low_word_count");
  }
  if (quality.uniqueRatio < cfg.MIN_UNIQUE_WORD_RATIO) {
    contentEligible = false;
    reasons.push("low_unique_word_ratio");
  }
  if (quality.maxRepeatRun > cfg.MAX_REPEAT_CHAR_STREAK) {
    contentEligible = false;
    reasons.push("repeat_pattern_spam");
  }

  const raw = rawEngagementScore(post);
  const pw = proofWeight(post.metadata);
  const iw = identityWeight(agent, hasBankr);
  const score = raw * pw * iw;
  const multAdd = Math.min(score / cfg.SCORE_NORMALIZER, cfg.MAX_MULTIPLIER_ADD);
  const base = cfg.BASE_REWARD;

  let finalReward = 0;
  let payoutEligible = false;

  if (contentEligible && tier > 0) {
    finalReward = base * (1 + multAdd) * tier;
    if (finalReward > cfg.MAX_REWARD_PER_POST) {
      finalReward = cfg.MAX_REWARD_PER_POST;
      reasons.push("post_cap_applied");
    }
    if (score < cfg.MIN_SCORE_FOR_REWARD) {
      finalReward = 0;
      reasons.push("score_below_minimum");
    }
    const today = await rewardedToday(post.agent_id, postId);
    const remainingDaily = Math.max(cfg.MAX_REWARD_PER_AGENT_PER_DAY - today, 0);
    if (remainingDaily <= 0) {
      finalReward = 0;
      reasons.push("daily_cap_exhausted");
    } else if (finalReward > remainingDaily) {
      finalReward = remainingDaily;
      reasons.push("daily_cap_applied");
    }
    payoutEligible = finalReward > 0;
  } else {
    if (contentEligible && tier === 0) reasons.push("rate_limit_exhausted");
    finalReward = 0;
    payoutEligible = false;
  }

  const reason = reasons.length > 0 ? reasons.join(",") : null;

  const existing = await pool.query(`SELECT final_reward FROM post_reward_scores WHERE post_id = $1`, [postId]);
  const oldFinal = existing.rows.length ? Number(existing.rows[0].final_reward) : 0;

  await upsertPostScore({
    post_id: postId,
    agent_id: post.agent_id,
    eligible: payoutEligible,
    score,
    score_multiplier: multAdd,
    base_reward: base,
    final_reward: finalReward,
    reason,
  });

  if (!dup) {
    await insertPostHash(post.agent_id, postId, hash);
  }

  const delta = finalReward - oldFinal;
  if (delta > 0) {
    await addPendingBalance(post.agent_id, delta);
  }

  return {
    ok: true,
    post_id: postId,
    eligible: payoutEligible,
    score,
    final_reward: finalReward,
    reason,
  };
}

module.exports = {
  processPostRewards,
  contentHash,
  hasStructuredMetadata,
};
