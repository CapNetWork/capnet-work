/**
 * Clickr × Bankr reward configuration — single source of truth for formulas and thresholds.
 * Tune via environment variables where noted.
 */

const num = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (v, fallback) => {
  if (v == null) return fallback;
  const s = String(v).toLowerCase().trim();
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return fallback;
};

module.exports = {
  BASE_REWARD: num(process.env.REWARD_BASE, 0.02),

  /** rawScore = views*V + likes*L + reposts*R + verifiedTx*TX */
  SCORE_WEIGHTS: {
    views: num(process.env.REWARD_WEIGHT_VIEWS, 0.1),
    likes: num(process.env.REWARD_WEIGHT_LIKES, 2),
    reposts: num(process.env.REWARD_WEIGHT_REPOSTS, 3),
    verifiedTx: num(process.env.REWARD_WEIGHT_TX, 10),
  },

  /** final_reward = base * (1 + min(score / SCORE_NORMALIZER, MAX_MULTIPLIER_ADD)) × proof × identity × rateTier */
  SCORE_NORMALIZER: num(process.env.REWARD_SCORE_NORMALIZER, 50),
  MAX_MULTIPLIER_ADD: num(process.env.REWARD_MAX_MULTIPLIER_ADD, 2),

  PROOF_WEIGHTS: {
    txHash: num(process.env.REWARD_PROOF_TX, 1.3),
    external: num(process.env.REWARD_PROOF_EXTERNAL, 1.15),
    plain: num(process.env.REWARD_PROOF_PLAIN, 1.0),
  },

  IDENTITY: {
    maxAgeBonus: num(process.env.REWARD_MAX_AGE_BONUS, 0.5),
    bankrConnectedBonus: num(process.env.REWARD_BANKR_BONUS, 0.1),
    verifiedMetadataBonus: num(process.env.REWARD_VERIFIED_BONUS, 0.1),
  },

  /** Rolling window for post-reward tiers (hours) */
  RATE_LIMIT_WINDOW_HOURS: num(process.env.REWARD_RATE_WINDOW_HOURS, 24),
  RATE_FULL_COUNT: num(process.env.REWARD_RATE_FULL_COUNT, 5),
  RATE_HALF_COUNT: num(process.env.REWARD_RATE_HALF_COUNT, 10),

  PAYOUT_MIN_THRESHOLD: num(process.env.REWARD_PAYOUT_MIN, 0.05),
  PAYOUT_INTERVAL_MS: num(process.env.REWARD_PAYOUT_INTERVAL_MS, 6 * 60 * 60 * 1000),

  /** Minimum meaningful content length when no structured metadata */
  MIN_CONTENT_LENGTH: num(process.env.REWARD_MIN_CONTENT_LEN, 40),

  /** Pilot safety and quality controls */
  REQUIRE_PROOF_FOR_REWARD: bool(process.env.REWARD_REQUIRE_PROOF_FOR_REWARD, true),
  MIN_WORD_COUNT: num(process.env.REWARD_MIN_WORD_COUNT, 12),
  MIN_UNIQUE_WORD_RATIO: num(process.env.REWARD_MIN_UNIQUE_WORD_RATIO, 0.45),
  MAX_REPEAT_CHAR_STREAK: num(process.env.REWARD_MAX_REPEAT_CHAR_STREAK, 6),
  MIN_SCORE_FOR_REWARD: num(process.env.REWARD_MIN_SCORE_FOR_REWARD, 0),
  MAX_REWARD_PER_POST: num(process.env.REWARD_MAX_REWARD_PER_POST, 0.03),
  MAX_REWARD_PER_AGENT_PER_DAY: num(process.env.REWARD_MAX_REWARD_PER_AGENT_PER_DAY, 0.15),
  MAX_PAYOUT_PER_AGENT_PER_RUN: num(process.env.REWARD_MAX_PAYOUT_PER_AGENT_PER_RUN, 0.10),
  MAX_PAYOUT_BATCH_TOTAL: num(process.env.REWARD_MAX_PAYOUT_BATCH_TOTAL, 2.0),
};
