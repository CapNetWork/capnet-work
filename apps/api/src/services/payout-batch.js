const { pool } = require("../db");
const { decryptUtf8 } = require("../lib/secret-crypto");
const { createPromptJob, getJob } = require("./bankr-client");
const cfg = require("../config/rewards");
const { notifyPayout } = require("./notification-dispatch");

/**
 * Process pending balances above threshold: decrypt Bankr keys, submit payout prompt, ledger rows.
 * Caller must enforce admin auth (cron secret).
 */
async function runPayoutBatch() {
  const threshold = cfg.PAYOUT_MIN_THRESHOLD;
  const pollAttempts = Math.max(parseInt(process.env.BANKR_JOB_POLL_ATTEMPTS || "3", 10), 1);
  const pollDelayMs = Math.max(parseInt(process.env.BANKR_JOB_POLL_DELAY_MS || "1000", 10), 100);
  const maxAgentRun = cfg.MAX_PAYOUT_PER_AGENT_PER_RUN;
  const maxBatch = cfg.MAX_PAYOUT_BATCH_TOTAL;
  const clients = await pool.query(
    `SELECT b.agent_id, b.pending_balance, a.wallet_address, a.api_key_encrypted, a.connection_status
     FROM agent_reward_balances b
     JOIN agent_bankr_accounts a ON a.agent_id = b.agent_id
     WHERE a.connection_status = 'connected_active'
       AND b.pending_balance >= $1`,
    [threshold]
  );

  const results = [];
  let batchAllocated = 0;
  for (const row of clients.rows) {
    const pending = Number(row.pending_balance);
    if (!Number.isFinite(pending) || pending < threshold) continue;
    if (batchAllocated >= maxBatch) {
      results.push({
        agent_id: row.agent_id,
        ok: false,
        error: "batch_cap_exhausted",
      });
      continue;
    }
    const amount = Math.min(pending, maxAgentRun, maxBatch - batchAllocated);
    if (amount < threshold) {
      results.push({
        agent_id: row.agent_id,
        ok: false,
        error: "below_threshold_after_caps",
      });
      continue;
    }
    batchAllocated += amount;

    let bankrKey;
    try {
      bankrKey = decryptUtf8(row.api_key_encrypted);
    } catch (e) {
      results.push({
        agent_id: row.agent_id,
        ok: false,
        error: e.message || "decrypt_failed",
      });
      continue;
    }

    const payoutInsert = await pool.query(
      `INSERT INTO reward_payouts (agent_id, amount, wallet_address, status, bankr_status)
       VALUES ($1, $2, $3, 'pending', 'queued')
       RETURNING id`,
      [row.agent_id, amount, row.wallet_address]
    );
    const payoutId = payoutInsert.rows[0].id;

    try {
      const prompt = `Send ${amount} USDC on Base to ${row.wallet_address} for Clickr posting reward`;
      const bankr = await createPromptJob(bankrKey, prompt);
      if (!bankr.job_id) {
        throw new Error("Bankr prompt response missing job_id");
      }
      await pool.query(
        `UPDATE reward_payouts
         SET bankr_job_id = $1, bankr_thread_id = $2, bankr_status = $3, status = 'submitted', updated_at = now()
         WHERE id = $4`,
        [bankr.job_id, bankr.thread_id, bankr.status || "queued", payoutId]
      );
      let jobStatus = bankr.status || "queued";
      for (let i = 0; i < pollAttempts; i += 1) {
        const polled = await getJob(bankrKey, bankr.job_id);
        jobStatus = polled.status || jobStatus;
        await pool.query(`UPDATE reward_payouts SET bankr_status = $1, updated_at = now() WHERE id = $2`, [
          jobStatus,
          payoutId,
        ]);
        if (jobStatus === "completed" || jobStatus === "failed") break;
        await new Promise((resolve) => setTimeout(resolve, pollDelayMs));
      }

      if (jobStatus === "completed" || jobStatus === "success") {
        await pool.query(
          `UPDATE agent_reward_balances SET
             pending_balance = GREATEST(pending_balance - $1, 0),
             paid_balance = paid_balance + $1,
             last_payout_at = now(),
             updated_at = now()
           WHERE agent_id = $2`,
          [amount, row.agent_id]
        );
        await pool.query(`UPDATE reward_payouts SET status = 'completed', updated_at = now() WHERE id = $1`, [payoutId]);
        results.push({ agent_id: row.agent_id, ok: true, amount, job_id: bankr.job_id, bankr_status: jobStatus });
        notifyPayout(row.agent_id, true, amount, `Job ${bankr.job_id}`).catch((e) =>
          console.error("[notify] payout:", e.message)
        );
      } else {
        await pool.query(
          `UPDATE reward_payouts SET status = 'failed', error_message = $1, updated_at = now() WHERE id = $2`,
          [`Bankr job ended in status: ${jobStatus}`, payoutId]
        );
        results.push({ agent_id: row.agent_id, ok: false, error: `Bankr status ${jobStatus}`, job_id: bankr.job_id });
        notifyPayout(row.agent_id, false, amount, `Bankr status ${jobStatus}`).catch((e) =>
          console.error("[notify] payout:", e.message)
        );
      }
    } catch (e) {
      await pool.query(
        `UPDATE reward_payouts
         SET status = 'failed', bankr_status = 'error', error_message = $1, updated_at = now()
         WHERE id = $2`,
        [String(e.message || e).slice(0, 2000), payoutId]
      );
      results.push({ agent_id: row.agent_id, ok: false, error: e.message });
    }
  }

  return { processed: results.length, results };
}

module.exports = { runPayoutBatch };
