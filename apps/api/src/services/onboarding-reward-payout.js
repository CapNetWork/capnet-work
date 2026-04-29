const crypto = require("crypto");
const { pool } = require("../db");
const privyDriver = require("../lib/drivers/privy");
const walletPolicy = require("../lib/wallet-policy");
const walletAudit = require("../lib/wallet-audit");

const REWARD_ENABLED = ["1", "true", "yes", "on"].includes(
  String(process.env.REWARD_ENABLED || "").trim().toLowerCase()
);
const REWARD_SOLANA_AMOUNT = String(process.env.REWARD_SOLANA_AMOUNT || "0.01").trim();
const REWARD_SOLANA_MINT = String(process.env.REWARD_SOLANA_MINT || "So11111111111111111111111111111111111111112").trim();
const REWARD_SOLANA_CLUSTER = String(process.env.REWARD_SOLANA_CLUSTER || "mainnet-beta").trim();
const REWARD_TREASURY_WALLET_REF = String(process.env.REWARD_TREASURY_WALLET_REF || "").trim();
const REWARD_TREASURY_AGENT_ID = String(process.env.REWARD_TREASURY_AGENT_ID || "").trim();
const REWARD_MAX_DAILY_PAYOUTS = Number(process.env.REWARD_MAX_DAILY_PAYOUTS || 200);

function solToLamportsDecimalString(amount) {
  const s = String(amount || "").trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    const err = new Error("REWARD_SOLANA_AMOUNT must be a non-negative decimal string");
    err.code = "REWARD_CONFIG_INVALID";
    throw err;
  }
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(9)).slice(0, 9);
  return (BigInt(whole) * BigInt(1_000_000_000) + BigInt(fracPadded || "0")).toString();
}

function buildPaymentRequirement({ amountAtomic, recipientWallet }) {
  return {
    scheme: "reward_payout",
    network: `solana:${REWARD_SOLANA_CLUSTER}`,
    amount: String(amountAtomic),
    asset: REWARD_SOLANA_MINT,
    pay_to: recipientWallet,
    payer: REWARD_TREASURY_WALLET_REF || null,
    version: "x402-compatible-v1",
  };
}

async function getRecipientPrivyWallet(agentId) {
  const r = await pool.query(
    `SELECT id, wallet_address
     FROM agent_wallets
     WHERE agent_id = $1 AND chain_type = 'solana' AND custody_type = 'privy'
     ORDER BY linked_at DESC LIMIT 1`,
    [agentId]
  );
  return r.rows[0] || null;
}

async function getTreasuryPrivyWallet() {
  if (!REWARD_TREASURY_AGENT_ID) {
    const err = new Error("REWARD_TREASURY_AGENT_ID is required");
    err.code = "REWARD_CONFIG_INVALID";
    throw err;
  }
  const byRefQuery = REWARD_TREASURY_WALLET_REF
    ? `AND (provider_wallet_id = $2 OR wallet_address = $2 OR id = $2)`
    : "";
  const params = REWARD_TREASURY_WALLET_REF
    ? [REWARD_TREASURY_AGENT_ID, REWARD_TREASURY_WALLET_REF]
    : [REWARD_TREASURY_AGENT_ID];
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
    const err = new Error("Treasury Privy wallet not found");
    err.code = "REWARD_TREASURY_WALLET_MISSING";
    throw err;
  }
  return r.rows[0];
}

async function ensureRow(client, agentId, ownerUserId = null) {
  const r = await client.query(
    `INSERT INTO agent_onboarding_rewards (agent_id, owner_user_id)
     VALUES ($1, $2)
     ON CONFLICT (agent_id) DO UPDATE
       SET owner_user_id = COALESCE(agent_onboarding_rewards.owner_user_id, EXCLUDED.owner_user_id),
           updated_at = now()
     RETURNING *`,
    [agentId, ownerUserId || null]
  );
  return r.rows[0];
}

async function markProfileCompleted(agentId, { ownerUserId = null } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await ensureRow(client, agentId, ownerUserId);
    await client.query(
      `UPDATE agent_onboarding_rewards
       SET profile_completed_at = COALESCE(profile_completed_at, now()),
           owner_user_id = COALESCE(owner_user_id, $2),
           eligible_at = CASE
             WHEN first_post_completed_at IS NOT NULL THEN COALESCE(eligible_at, now())
             ELSE eligible_at
           END,
           updated_at = now()
       WHERE id = $1`,
      [row.id, ownerUserId || null]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return evaluateAndPay(agentId);
}

async function markFirstPostCompleted(agentId, { ownerUserId = null } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await ensureRow(client, agentId, ownerUserId);
    await client.query(
      `UPDATE agent_onboarding_rewards
       SET first_post_completed_at = COALESCE(first_post_completed_at, now()),
           owner_user_id = COALESCE(owner_user_id, $2),
           eligible_at = CASE
             WHEN profile_completed_at IS NOT NULL THEN COALESCE(eligible_at, now())
             ELSE eligible_at
           END,
           updated_at = now()
       WHERE id = $1`,
      [row.id, ownerUserId || null]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return evaluateAndPay(agentId);
}

async function evaluateAndPay(agentId) {
  if (!REWARD_ENABLED) return { ok: false, skipped: true, reason: "reward_disabled" };

  const client = await pool.connect();
  let inTx = false;
  try {
    await client.query("BEGIN");
    inTx = true;

    const rewardRes = await client.query(
      `SELECT *
       FROM agent_onboarding_rewards
       WHERE agent_id = $1
       FOR UPDATE`,
      [agentId]
    );
    if (rewardRes.rows.length === 0) {
      await client.query("COMMIT");
      return { ok: false, skipped: true, reason: "reward_row_missing" };
    }
    const reward = rewardRes.rows[0];
    if (!reward.profile_completed_at || !reward.first_post_completed_at) {
      await client.query("COMMIT");
      inTx = false;
      return { ok: true, paid: false, reason: "milestones_incomplete" };
    }
    if (reward.reward_status === "paid") {
      await client.query("COMMIT");
      inTx = false;
      return { ok: true, paid: false, reason: "already_paid", tx: reward.solana_tx_signature };
    }
    if (!reward.owner_user_id) {
      await client.query(
        `UPDATE agent_onboarding_rewards
         SET reward_status = 'failed', updated_at = now(), last_attempt_at = now()
         WHERE id = $1`,
        [reward.id]
      );
      const idem = reward.idempotency_key || crypto.randomUUID();
      await client.query(
        `INSERT INTO agent_onboarding_reward_attempts
         (reward_id, agent_id, owner_user_id, idempotency_key, status, error_code, error_message)
         VALUES ($1,$2,$3,$4,'blocked',$5,$6)`,
        [reward.id, reward.agent_id, reward.owner_user_id, idem, "owner_user_missing", "Reward requires a session-owned agent"]
      );
      await client.query("COMMIT");
      inTx = false;
      return { ok: false, paid: false, reason: "owner_user_missing" };
    }

    const todayCount = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM agent_onboarding_rewards
       WHERE paid_at >= date_trunc('day', now())`
    );
    if (Number(todayCount.rows[0]?.c || 0) >= REWARD_MAX_DAILY_PAYOUTS) {
      await client.query(
        `UPDATE agent_onboarding_rewards
         SET reward_status = 'failed', updated_at = now(), last_attempt_at = now()
         WHERE id = $1`,
        [reward.id]
      );
      const idem = reward.idempotency_key || crypto.randomUUID();
      await client.query(
        `INSERT INTO agent_onboarding_reward_attempts
         (reward_id, agent_id, owner_user_id, idempotency_key, status, error_code, error_message)
         VALUES ($1,$2,$3,$4,'blocked',$5,$6)`,
        [reward.id, reward.agent_id, reward.owner_user_id, idem, "daily_cap_reached", "Daily reward cap reached"]
      );
      await client.query("COMMIT");
      inTx = false;
      return { ok: false, paid: false, reason: "daily_cap_reached" };
    }

    const idem = reward.idempotency_key || crypto.randomUUID();
    await client.query(
      `UPDATE agent_onboarding_rewards
       SET reward_status = 'processing',
           idempotency_key = COALESCE(idempotency_key, $2),
           updated_at = now(),
           last_attempt_at = now()
       WHERE id = $1`,
      [reward.id, idem]
    );

    const recipient = await getRecipientPrivyWallet(agentId);
    if (!recipient) {
      await client.query(
        `UPDATE agent_onboarding_rewards
         SET reward_status = 'pending', updated_at = now()
         WHERE id = $1`,
        [reward.id]
      );
      await client.query(
        `INSERT INTO agent_onboarding_reward_attempts
         (reward_id, agent_id, owner_user_id, idempotency_key, status, error_code, error_message)
         VALUES ($1,$2,$3,$4,'blocked',$5,$6)`,
        [reward.id, reward.agent_id, reward.owner_user_id, idem, "recipient_wallet_missing", "No recipient Privy Solana wallet linked"]
      );
      await client.query("COMMIT");
      inTx = false;
      return { ok: false, paid: false, reason: "recipient_wallet_missing" };
    }
    const reusedWallet = await client.query(
      `SELECT agent_id
       FROM agent_onboarding_rewards
       WHERE recipient_wallet_address = $1
         AND reward_status = 'paid'
         AND agent_id <> $2
       LIMIT 1`,
      [recipient.wallet_address, agentId]
    );
    if (reusedWallet.rows.length > 0) {
      await client.query(
        `UPDATE agent_onboarding_rewards
         SET reward_status = 'failed', updated_at = now(), last_attempt_at = now()
         WHERE id = $1`,
        [reward.id]
      );
      await client.query(
        `INSERT INTO agent_onboarding_reward_attempts
         (reward_id, agent_id, owner_user_id, idempotency_key, status, error_code, error_message)
         VALUES ($1,$2,$3,$4,'blocked',$5,$6)`,
        [
          reward.id,
          reward.agent_id,
          reward.owner_user_id,
          idem,
          "recipient_wallet_reused",
          "Recipient wallet already used by another rewarded agent",
        ]
      );
      await client.query("COMMIT");
      inTx = false;
      return { ok: false, paid: false, reason: "recipient_wallet_reused" };
    }

    const amountAtomic = solToLamportsDecimalString(REWARD_SOLANA_AMOUNT);
    const paymentRequirement = buildPaymentRequirement({
      amountAtomic,
      recipientWallet: recipient.wallet_address,
    });

    await client.query(
      `INSERT INTO agent_onboarding_reward_attempts
       (reward_id, agent_id, owner_user_id, idempotency_key, status, amount_atomic, asset, network,
        recipient_wallet_address, funding_wallet_ref, payment_requirement_json)
       VALUES ($1,$2,$3,$4,'processing',$5,$6,$7,$8,$9,$10::jsonb)`,
      [
        reward.id,
        reward.agent_id,
        reward.owner_user_id,
        idem,
        amountAtomic,
        REWARD_SOLANA_MINT,
        `solana:${REWARD_SOLANA_CLUSTER}`,
        recipient.wallet_address,
        REWARD_TREASURY_WALLET_REF || null,
        JSON.stringify(paymentRequirement),
      ]
    );

    await client.query("COMMIT");
    inTx = false;

    const treasuryWallet = await getTreasuryPrivyWallet();
    const built = await privyDriver.buildTransferTransaction({
      fromAddress: treasuryWallet.wallet_address,
      toAddress: recipient.wallet_address,
      lamports: Number(amountAtomic),
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
      authMethod: "api_key",
    });

    const sendResult = await privyDriver.signAndSend(treasuryWallet, built.transaction);
    const txSig = sendResult.txHash || null;
    await walletAudit.updateOutcome(auditAttempt.id, { txHash: txSig, status: "submitted" });

    const receipt = {
      scheme: "x402-compatible-receipt",
      version: "1",
      idempotency_key: idem,
      network: `solana:${REWARD_SOLANA_CLUSTER}`,
      amount: amountAtomic,
      asset: REWARD_SOLANA_MINT,
      payer: treasuryWallet.wallet_address,
      pay_to: recipient.wallet_address,
      transaction: txSig,
      paid_at: new Date().toISOString(),
    };

    await pool.query(
      `UPDATE agent_onboarding_rewards
       SET reward_status = 'paid',
           reward_amount_atomic = $2,
           reward_asset = $3,
           reward_network = $4,
           recipient_wallet_address = $5,
           funding_wallet_ref = $6,
           solana_tx_signature = $7,
           payment_requirement_json = $8::jsonb,
           x402_compatible_receipt_json = $9::jsonb,
           paid_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [
        reward.id,
        amountAtomic,
        REWARD_SOLANA_MINT,
        `solana:${REWARD_SOLANA_CLUSTER}`,
        recipient.wallet_address,
        REWARD_TREASURY_WALLET_REF || null,
        txSig,
        JSON.stringify(paymentRequirement),
        JSON.stringify(receipt),
      ]
    );
    await pool.query(
      `UPDATE agent_onboarding_reward_attempts
       SET status = 'paid',
           solana_tx_signature = $2,
           x402_compatible_receipt_json = $3::jsonb
       WHERE reward_id = $1 AND idempotency_key = $4`,
      [reward.id, txSig, JSON.stringify(receipt), idem]
    );

    return { ok: true, paid: true, tx_signature: txSig };
  } catch (err) {
    if (inTx) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {}
    }
    try {
      await pool.query(
        `UPDATE agent_onboarding_rewards
         SET reward_status = 'failed',
             updated_at = now()
         WHERE agent_id = $1`,
        [agentId]
      );
      const message = String(err.message || err).slice(0, 500);
      await pool.query(
        `INSERT INTO agent_onboarding_reward_attempts
         (reward_id, agent_id, owner_user_id, idempotency_key, status, error_code, error_message)
         SELECT id, agent_id, owner_user_id, COALESCE(idempotency_key, $2), 'failed', $3, $4
         FROM agent_onboarding_rewards
         WHERE agent_id = $1`,
        [agentId, crypto.randomUUID(), err.code || "reward_error", message]
      );
    } catch (_) {
      // best-effort failure logging
    }
    return { ok: false, paid: false, error: err.message, code: err.code || "reward_error" };
  } finally {
    client.release();
  }
}

async function getRewardStatus(agentId) {
  const reward = await pool.query(
    `SELECT *
     FROM agent_onboarding_rewards
     WHERE agent_id = $1`,
    [agentId]
  );
  const attempts = await pool.query(
    `SELECT id, idempotency_key, status, amount_atomic, asset, network, recipient_wallet_address,
            funding_wallet_ref, solana_tx_signature, error_code, error_message, created_at
     FROM agent_onboarding_reward_attempts
     WHERE agent_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [agentId]
  );
  return { reward: reward.rows[0] || null, attempts: attempts.rows };
}

module.exports = {
  markProfileCompleted,
  markFirstPostCompleted,
  evaluateAndPay,
  getRewardStatus,
  __private: {
    solToLamportsDecimalString,
    buildPaymentRequirement,
  },
};

