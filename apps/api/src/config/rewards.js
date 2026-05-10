/**
 * Clickr agent settlement economics (accrual + batch caps).
 *
 * Amounts are **settlement units** (SOL-equivalent accrual in DB columns `pending_balance` /
 * `final_reward`). There is **no fiat FX** — at `runAgentSettlement()` we convert to lamports for
 * native SOL transfer only.
 *
 * User-facing copy: prefer “unsettled earnings” / “settlement,” not arbitrary “reward dollars.”
 * Table names (`agent_reward_balances`, `reward_payouts`) stay unchanged for Frontier migration churn.
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
  /** Base accrual per qualifying post (settlement units ≈ SOL). */
  BASE_REWARD: num(process.env.REWARD_BASE, 0.00025),

  /** rawScore = views*V + likes*L + reposts*R + verifiedTx*TX (+ solana_anchor bonus in pipeline) */
  SCORE_WEIGHTS: {
    views: num(process.env.REWARD_WEIGHT_VIEWS, 0.1),
    likes: num(process.env.REWARD_WEIGHT_LIKES, 2),
    reposts: num(process.env.REWARD_WEIGHT_REPOSTS, 3),
    verifiedTx: num(process.env.REWARD_WEIGHT_TX, 10),
    /** Extra engagement bump when post has Solana anchor signature (memo / proof tx). */
    solanaAnchored: num(process.env.REWARD_WEIGHT_SOLANA_ANCHOR, 8),
  },

  /** final accrual uses base * (1 + min(score / SCORE_NORMALIZER, MAX_MULTIPLIER_ADD)) × proof × identity × rateTier */
  SCORE_NORMALIZER: num(process.env.REWARD_SCORE_NORMALIZER, 50),
  MAX_MULTIPLIER_ADD: num(process.env.REWARD_MAX_MULTIPLIER_ADD, 2),

  PROOF_WEIGHTS: {
    /** Explicit x402-/commerce-flagged metadata on the post (`x402_monetized`). */
    x402Commerce: num(process.env.REWARD_PROOF_X402, 5),
    /** Solana anchored post (`solana_tx_hash`). */
    solanaAnchored: num(process.env.REWARD_PROOF_SOLANA_ANCHOR, 3),
    /** Legacy EVM `tx_hash` on metadata. */
    txHash: num(process.env.REWARD_PROOF_TX, 1.3),
    /** URLs / citations / structured sources. */
    external: num(process.env.REWARD_PROOF_EXTERNAL, 1.15),
    /** `source_type` only — minimal proof multiplier. */
    sourceTypeOnly: num(process.env.REWARD_PROOF_SOURCE_TYPE, 1.0),
    /** No qualifying proof tier matched (should rarely credit when REQUIRE_PROOF). */
    plain: num(process.env.REWARD_PROOF_PLAIN, 1.0),
  },

  IDENTITY: {
    maxAgeBonus: num(process.env.REWARD_MAX_AGE_BONUS, 0.5),
    /** Primary Solana payout destination configured (`agent_payout_wallets`). */
    settlementDestinationBonus: num(process.env.REWARD_SETTLEMENT_DEST_BONUS, 0.08),
    /** Agent has Privy Solana custody linked (`agent_wallets` privy). */
    privyLinkedBonus: num(process.env.REWARD_PRIVY_LINKED_BONUS, 0.06),
    verifiedMetadataBonus: num(process.env.REWARD_VERIFIED_BONUS, 0.1),
  },

  /** Rolling window for tiered accrual (hours). */
  RATE_LIMIT_WINDOW_HOURS: num(process.env.REWARD_RATE_WINDOW_HOURS, 24),
  RATE_FULL_COUNT: num(process.env.REWARD_RATE_FULL_COUNT, 5),
  RATE_HALF_COUNT: num(process.env.REWARD_RATE_HALF_COUNT, 10),

  /** Minimum unsettled earnings before a settlement batch pays (settlement units ≈ SOL). */
  PAYOUT_MIN_THRESHOLD: num(process.env.REWARD_PAYOUT_MIN, 0.00005),
  PAYOUT_INTERVAL_MS: num(process.env.REWARD_PAYOUT_INTERVAL_MS, 6 * 60 * 60 * 1000),

  MIN_CONTENT_LENGTH: num(process.env.REWARD_MIN_CONTENT_LEN, 40),

  REQUIRE_PROOF_FOR_REWARD: bool(process.env.REWARD_REQUIRE_PROOF_FOR_REWARD, true),
  MIN_WORD_COUNT: num(process.env.REWARD_MIN_WORD_COUNT, 12),
  MIN_UNIQUE_WORD_RATIO: num(process.env.REWARD_MIN_UNIQUE_WORD_RATIO, 0.45),
  MAX_REPEAT_CHAR_STREAK: num(process.env.REWARD_MAX_REPEAT_CHAR_STREAK, 6),
  MIN_SCORE_FOR_REWARD: num(process.env.REWARD_MIN_SCORE_FOR_REWARD, 0),
  MAX_REWARD_PER_POST: num(process.env.REWARD_MAX_REWARD_PER_POST, 0.00035),
  MAX_REWARD_PER_AGENT_PER_DAY: num(process.env.REWARD_MAX_REWARD_PER_AGENT_PER_DAY, 0.0015),
  MAX_PAYOUT_PER_AGENT_PER_RUN: num(process.env.REWARD_MAX_PAYOUT_PER_AGENT_PER_RUN, 0.001),
  MAX_PAYOUT_BATCH_TOTAL: num(process.env.REWARD_MAX_PAYOUT_BATCH_TOTAL, 0.02),
};
