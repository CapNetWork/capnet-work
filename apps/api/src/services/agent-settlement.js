const { pool } = require("../db");
const privyDriver = require("../lib/drivers/privy");
const walletPolicy = require("../lib/wallet-policy");
const walletAudit = require("../lib/wallet-audit");
const cfg = require("../config/rewards");

const SETTLEMENT_TREASURY_AGENT_ID = String(
  process.env.SETTLEMENT_TREASURY_AGENT_ID || process.env.REWARD_TREASURY_AGENT_ID || ""
).trim();
const SETTLEMENT_TREASURY_WALLET_REF = String(
  process.env.SETTLEMENT_TREASURY_WALLET_REF || process.env.REWARD_TREASURY_WALLET_REF || ""
).trim();

/** Accrued “settlement units” are SOL-equivalent; convert to lamports at transfer time (no fiat FX). */
function settlementUnitsToLamports(units) {
  const n = Number(units);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const lamports = Math.floor(n * 1_000_000_000);
  return lamports > 0 ? lamports : 0;
}

async function getTreasuryPrivyWallet() {
  if (!SETTLEMENT_TREASURY_AGENT_ID) {
    const err = new Error("SETTLEMENT_TREASURY_AGENT_ID or REWARD_TREASURY_AGENT_ID is required");
    err.code = "SETTLEMENT_CONFIG_INVALID";
    throw err;
  }
  const byRefQuery = SETTLEMENT_TREASURY_WALLET_REF
    ? `AND (provider_wallet_id = $2 OR wallet_address = $2 OR id = $2)`
    : "";
  const params = SETTLEMENT_TREASURY_WALLET_REF
    ? [SETTLEMENT_TREASURY_AGENT_ID, SETTLEMENT_TREASURY_WALLET_REF]
    : [SETTLEMENT_TREASURY_AGENT_ID];
  const r = await pool.query(
    `SELECT id, agent_id, wallet_address, chain_type, custody_type, provider_wallet_id, policy_json,
            is_paused, paused_reason
     FROM agent_wallets
     WHERE agent_id = $1 AND chain_type = 'solana' AND custody_type = 'privy'
     ${byRefQuery}
     ORDER BY linked_at DESC LIMIT 1`,
    params
  );
  if (r.rows.length === 0) {
    const err = new Error("Settlement treasury Privy wallet not found");
    err.code = "SETTLEMENT_TREASURY_WALLET_MISSING";
    throw err;
  }
  return r.rows[0];
}

/**
 * Pays native SOL from the settlement treasury Privy wallet to each agent’s primary payout address.
 * Reuses onboarding-style policy + audit pipeline.
 *
 * Idempotency: per-run row in reward_payouts; caps from config/rewards.js (settlement units).
 */
async function runAgentSettlement() {
  const threshold = cfg.PAYOUT_MIN_THRESHOLD;
  const maxAgentRun = cfg.MAX_PAYOUT_PER_AGENT_PER_RUN;
  const maxBatch = cfg.MAX_PAYOUT_BATCH_TOTAL;
  let treasuryWallet;
  try {
    treasuryWallet = await getTreasuryPrivyWallet();
  } catch (e) {
    console.warn("[agent-settlement] skipped:", e.message);
    return { processed: 0, results: [], skipped: true, reason: e.message };
  }

  if (treasuryWallet.is_paused) {
    console.warn("[agent-settlement] skipped: treasury wallet paused");
    return { processed: 0, results: [], skipped: true, reason: "treasury_paused" };
  }

  let clients;
  try {
    clients = await pool.query(
      `SELECT b.agent_id, b.pending_balance, pw.wallet_address, pw.id AS payout_wallet_id, pw.wallet_provider
       FROM agent_reward_balances b
       JOIN agent_payout_wallets pw ON pw.agent_id = b.agent_id AND pw.chain = 'solana' AND pw.is_primary IS TRUE
       WHERE b.pending_balance >= $1`,
      [threshold]
    );
  } catch (e) {
    if (e.code === "42P01") {
      return { processed: 0, results: [], skipped: true, reason: "agent_payout_wallets_migration_missing" };
    }
    throw e;
  }

  const results = [];
  let batchAllocated = 0;

  for (const row of clients.rows) {
    const pending = Number(row.pending_balance);
    if (!Number.isFinite(pending) || pending < threshold) continue;

    if (batchAllocated >= maxBatch) {
      results.push({ agent_id: row.agent_id, ok: false, error: "batch_cap_exhausted" });
      continue;
    }

    const amountUnits = Math.min(pending, maxAgentRun, maxBatch - batchAllocated);
    if (amountUnits < threshold) {
      results.push({ agent_id: row.agent_id, ok: false, error: "below_threshold_after_caps" });
      continue;
    }

    const lamports = settlementUnitsToLamports(amountUnits);
    if (lamports <= 0) {
      results.push({ agent_id: row.agent_id, ok: false, error: "sub_lamports" });
      continue;
    }

    batchAllocated += amountUnits;

    const payoutInsert = await pool.query(
      `INSERT INTO reward_payouts (agent_id, amount, wallet_address, status, settlement_kind, settlement_note)
       VALUES ($1, $2, $3, 'pending', 'unsettled_earnings', $4)
       RETURNING id`,
      [row.agent_id, amountUnits, row.wallet_address, `provider=${row.wallet_provider || "unknown"}`]
    );
    const payoutId = payoutInsert.rows[0].id;

    try {
      const built = await privyDriver.buildTransferTransaction({
        fromAddress: treasuryWallet.wallet_address,
        toAddress: row.wallet_address.trim(),
        lamports,
      });
      await walletPolicy.enforce(treasuryWallet, {
        amount_lamports: built.amount_lamports,
        destination: built.destination,
        program_id: built.programId,
      });

      const auditAttempt = await walletAudit.logAttempt({
        agentId: treasuryWallet.agent_id,
        walletId: treasuryWallet.id,
        walletAddress: treasuryWallet.wallet_address,
        chainType: "solana",
        custodyType: "privy",
        txType: "send_transaction",
        amountLamports: built.amount_lamports,
        destination: built.destination,
        programId: built.programId,
        authMethod: "service",
      });

      const sendResult = await privyDriver.signAndSend(treasuryWallet, built.transaction);
      const txSig = sendResult.txHash || null;

      await walletAudit.updateOutcome(auditAttempt.id, { txHash: txSig, status: "submitted" });

      if (txSig) {
        await pool.query(
          `UPDATE agent_reward_balances SET
             pending_balance = GREATEST(pending_balance - $1, 0),
             paid_balance = paid_balance + $1,
             last_payout_at = now(),
             updated_at = now()
           WHERE agent_id = $2`,
          [amountUnits, row.agent_id]
        );
        await pool.query(
          `UPDATE reward_payouts SET status = 'completed', tx_hash = $1, updated_at = now(), bankr_status = NULL
           WHERE id = $2`,
          [txSig, payoutId]
        );
        results.push({
          agent_id: row.agent_id,
          ok: true,
          amount_settlement_units: amountUnits,
          lamports,
          tx_hash: txSig,
        });
      } else {
        await pool.query(
          `UPDATE reward_payouts SET status = 'failed', error_message = $1, updated_at = now() WHERE id = $2`,
          ["Missing tx signature after settlement send", payoutId]
        );
        results.push({ agent_id: row.agent_id, ok: false, error: "no_tx_signature" });
      }
    } catch (e) {
      await pool.query(
        `UPDATE reward_payouts SET status = 'failed', error_message = $1, updated_at = now() WHERE id = $2`,
        [String(e.message || e).slice(0, 2000), payoutId]
      );
      results.push({ agent_id: row.agent_id, ok: false, error: e.message });
    }
  }

  return { processed: results.length, results };
}

module.exports = { runAgentSettlement, settlementUnitsToLamports, getTreasuryPrivyWallet };
