/**
 * Server-side wallet policy enforcer.
 * Source of truth for "is this Privy send allowed?" — runs before we ask Privy
 * to sign anything. Privy-side policy attach is best-effort; this module is the
 * trustworthy gate.
 *
 * Policy shape (stored as JSONB on agent_wallets.policy_json):
 *   {
 *     "max_lamports_per_tx":           number,        // single-tx cap
 *     "max_lamports_per_day":          number,        // 24h rolling cap (sum of submitted+confirmed)
 *     "allowed_program_ids":           string[],      // base58 program ids; "*" disables the check
 *     "require_destination_allowlist": boolean,
 *     "allowed_destinations":          string[]       // ignored unless require_destination_allowlist=true
 *   }
 */
const { pool } = require("../db");
const walletAudit = require("./wallet-audit");

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const JUPITER_V6_PROGRAM_ID = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

const DEFAULT_POLICY = Object.freeze({
  max_lamports_per_tx: 100_000_000, // 0.1 SOL
  max_lamports_per_day: 500_000_000, // 0.5 SOL
  allowed_program_ids: [
    MEMO_PROGRAM_ID,
    JUPITER_V6_PROGRAM_ID,
    "jupiter-v6", // logical label used by contract-intents
    "clickr-post-memo",
    "clickr-intent-memo",
    "clickr-test-memo",
    "spl-memo",
  ],
  require_destination_allowlist: false,
  allowed_destinations: [],
});

function getEffectivePolicy(walletRow) {
  if (walletRow && walletRow.policy_json && typeof walletRow.policy_json === "object") {
    return { ...DEFAULT_POLICY, ...walletRow.policy_json };
  }
  return { ...DEFAULT_POLICY };
}

function policyError(rule, message) {
  const err = new Error(message);
  err.code = "WALLET_POLICY_VIOLATION";
  err.status = 403;
  err.rule = rule;
  return err;
}

function pausedError(walletRow) {
  const reason = walletRow?.paused_reason || "wallet_paused";
  const err = new Error(`Wallet is paused: ${reason}`);
  err.code = "WALLET_PAUSED";
  err.status = 423;
  return err;
}

/**
 * Re-fetch the latest pause + policy state for a wallet so callers can rely on
 * fresh data even if the row in memory is stale.
 */
async function loadWalletState(walletId) {
  const r = await pool.query(
    `SELECT id, agent_id, wallet_address, chain_type, custody_type,
            provider_wallet_id, provider_policy_id,
            is_paused, paused_at, paused_reason, policy_json
     FROM agent_wallets
     WHERE id = $1`,
    [walletId]
  );
  return r.rows[0] || null;
}

function validateProgram(policy, intent) {
  const allowed = Array.isArray(policy.allowed_program_ids) ? policy.allowed_program_ids : [];
  if (allowed.length === 1 && allowed[0] === "*") return;
  if (allowed.length === 0) return; // empty list = unrestricted (default policy provides a sensible list)
  const programId = intent.program_id || intent.programId || null;
  if (!programId) {
    throw policyError("program_required", "program_id is required for policy enforcement");
  }
  if (!allowed.includes(programId)) {
    throw policyError(
      "program_not_allowed",
      `program_id '${programId}' is not in the wallet's allowed_program_ids`
    );
  }
}

function validateDestination(policy, intent) {
  if (!policy.require_destination_allowlist) return;
  const allowed = Array.isArray(policy.allowed_destinations) ? policy.allowed_destinations : [];
  const destination = intent.destination || intent.dest || null;
  if (!destination) {
    throw policyError("destination_required", "destination is required when destination allowlist is enabled");
  }
  if (!allowed.includes(destination)) {
    throw policyError(
      "destination_not_allowed",
      `destination '${destination}' is not in the wallet's allowed_destinations`
    );
  }
}

function validatePerTxCap(policy, intent) {
  const cap = Number(policy.max_lamports_per_tx);
  if (!Number.isFinite(cap) || cap <= 0) return;
  const amount = Number(intent.amount_lamports || intent.amountLamports || 0);
  if (!Number.isFinite(amount) || amount <= 0) return; // per-tx cap can't apply to txs with unknown amount
  if (amount > cap) {
    throw policyError(
      "per_tx_cap",
      `Transaction amount ${amount} lamports exceeds wallet cap ${cap} lamports`
    );
  }
}

async function validateDailyCap(policy, walletRow, intent) {
  const cap = Number(policy.max_lamports_per_day);
  if (!Number.isFinite(cap) || cap <= 0) return;
  const amount = Number(intent.amount_lamports || intent.amountLamports || 0);
  const spent = await walletAudit.getDailySpend(walletRow.agent_id, walletRow.id);
  if (spent + amount > cap) {
    throw policyError(
      "daily_cap",
      `24h spend ${spent} + ${amount} lamports would exceed wallet daily cap ${cap}`
    );
  }
}

/**
 * Enforce both pause flag and policy. Throws a tagged Error on violation. Caller
 * is responsible for mapping err.code → HTTP status and recording the blocked
 * attempt in the audit table.
 */
async function enforce(walletRow, intent = {}) {
  if (!walletRow) {
    const err = new Error("walletRow required for policy enforcement");
    err.code = "WALLET_POLICY_INVALID";
    err.status = 400;
    throw err;
  }
  // Re-fetch fresh state so a stale row can't sneak past pause/policy edits.
  const fresh = (await loadWalletState(walletRow.id)) || walletRow;
  if (fresh.is_paused) {
    throw pausedError(fresh);
  }
  const policy = getEffectivePolicy(fresh);
  validateProgram(policy, intent);
  validateDestination(policy, intent);
  validatePerTxCap(policy, intent);
  await validateDailyCap(policy, fresh, intent);
  return { walletRow: fresh, policy };
}

/**
 * Validate + merge a partial policy update. Returns the new policy object.
 * Throws on invalid input.
 */
function mergePolicyUpdate(currentPolicy, partial) {
  if (!partial || typeof partial !== "object" || Array.isArray(partial)) {
    const err = new Error("policy update must be an object");
    err.code = "WALLET_POLICY_INVALID";
    err.status = 400;
    throw err;
  }
  const next = { ...getEffectivePolicy({ policy_json: currentPolicy }) };

  if (partial.max_lamports_per_tx !== undefined) {
    const v = Number(partial.max_lamports_per_tx);
    if (!Number.isFinite(v) || v < 0) {
      const err = new Error("max_lamports_per_tx must be a non-negative number");
      err.code = "WALLET_POLICY_INVALID";
      err.status = 400;
      throw err;
    }
    next.max_lamports_per_tx = v;
  }
  if (partial.max_lamports_per_day !== undefined) {
    const v = Number(partial.max_lamports_per_day);
    if (!Number.isFinite(v) || v < 0) {
      const err = new Error("max_lamports_per_day must be a non-negative number");
      err.code = "WALLET_POLICY_INVALID";
      err.status = 400;
      throw err;
    }
    next.max_lamports_per_day = v;
  }
  if (partial.allowed_program_ids !== undefined) {
    if (!Array.isArray(partial.allowed_program_ids)) {
      const err = new Error("allowed_program_ids must be an array of strings");
      err.code = "WALLET_POLICY_INVALID";
      err.status = 400;
      throw err;
    }
    next.allowed_program_ids = partial.allowed_program_ids
      .filter((s) => typeof s === "string" && s.length > 0 && s.length <= 64)
      .slice(0, 64);
  }
  if (partial.require_destination_allowlist !== undefined) {
    next.require_destination_allowlist = Boolean(partial.require_destination_allowlist);
  }
  if (partial.allowed_destinations !== undefined) {
    if (!Array.isArray(partial.allowed_destinations)) {
      const err = new Error("allowed_destinations must be an array of strings");
      err.code = "WALLET_POLICY_INVALID";
      err.status = 400;
      throw err;
    }
    next.allowed_destinations = partial.allowed_destinations
      .filter((s) => typeof s === "string" && s.length > 0 && s.length <= 64)
      .slice(0, 256);
  }
  return next;
}

module.exports = {
  DEFAULT_POLICY,
  MEMO_PROGRAM_ID,
  JUPITER_V6_PROGRAM_ID,
  getEffectivePolicy,
  enforce,
  loadWalletState,
  mergePolicyUpdate,
};
