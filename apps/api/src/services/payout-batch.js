const { pool } = require("../db");
const { decryptUtf8 } = require("../lib/secret-crypto");
const { submitPayoutPrompt } = require("./bankr-client");
const cfg = require("../config/rewards");

/**
 * Process pending balances above threshold: decrypt Bankr keys, submit payout prompt, ledger rows.
 * Caller must enforce admin auth (cron secret).
 */
async function runPayoutBatch() {
  const threshold = cfg.PAYOUT_MIN_THRESHOLD;
  const clients = await pool.query(
    `SELECT b.agent_id, b.pending_balance, a.wallet_address, a.api_key_encrypted
     FROM agent_reward_balances b
     JOIN agent_bankr_accounts a ON a.agent_id = b.agent_id
     WHERE a.connection_status = 'connected'
       AND b.pending_balance >= $1`,
    [threshold]
  );

  const results = [];
  for (const row of clients.rows) {
    const amount = Number(row.pending_balance);
    if (!Number.isFinite(amount) || amount < threshold) continue;

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
      `INSERT INTO reward_payouts (agent_id, amount, wallet_address, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id`,
      [row.agent_id, amount, row.wallet_address]
    );
    const payoutId = payoutInsert.rows[0].id;

    try {
      const bankr = await submitPayoutPrompt({
        bankrApiKey: bankrKey,
        amountUsdc: amount,
        recipientWallet: row.wallet_address,
      });
      await pool.query(
        `UPDATE reward_payouts SET bankr_job_id = $1, status = 'submitted', updated_at = now() WHERE id = $2`,
        [bankr.job_id, payoutId]
      );
      await pool.query(
        `UPDATE agent_reward_balances SET
           pending_balance = 0,
           paid_balance = paid_balance + $1,
           last_payout_at = now(),
           updated_at = now()
         WHERE agent_id = $2`,
        [amount, row.agent_id]
      );
      results.push({ agent_id: row.agent_id, ok: true, amount, job_id: bankr.job_id });
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

module.exports = { runPayoutBatch };
