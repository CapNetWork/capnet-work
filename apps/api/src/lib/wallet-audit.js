/**
 * Wallet audit logger.
 * Every wallet operation (sign, send, create, destroy) is logged to
 * agent_wallet_transactions. The reputation engine consumes this table.
 */
const { pool } = require("../db");

async function logAttempt({
  agentId,
  walletId,
  walletAddress,
  chainType,
  custodyType,
  txType,
  amountLamports,
  destination,
  programId,
  authMethod,
}) {
  const r = await pool.query(
    `INSERT INTO agent_wallet_transactions
       (agent_id, wallet_id, wallet_address, chain_type, custody_type,
        tx_type, amount_lamports, destination, program_id, status, auth_method)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
     RETURNING id, created_at`,
    [
      agentId,
      walletId || null,
      walletAddress,
      chainType,
      custodyType,
      txType,
      amountLamports || null,
      destination || null,
      programId || null,
      authMethod,
    ]
  );
  return r.rows[0];
}

async function updateOutcome(txId, { txHash, status, errorMessage }) {
  await pool.query(
    `UPDATE agent_wallet_transactions
     SET tx_hash = COALESCE($2, tx_hash),
         status = $3,
         error_message = $4,
         completed_at = now()
     WHERE id = $1`,
    [txId, txHash || null, status, errorMessage || null]
  );
}

async function getDailySpend(agentId, walletId) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(amount_lamports), 0) AS total
     FROM agent_wallet_transactions
     WHERE agent_id = $1
       AND ($2::text IS NULL OR wallet_id = $2)
       AND tx_type = 'send_transaction'
       AND status IN ('submitted', 'confirmed')
       AND created_at >= now() - interval '24 hours'`,
    [agentId, walletId || null]
  );
  return Number(r.rows[0].total);
}

async function getHistory(agentId, { walletId, limit = 20, offset = 0 } = {}) {
  const r = await pool.query(
    `SELECT id, wallet_address, chain_type, custody_type, tx_type,
            tx_hash, amount_lamports, destination, program_id,
            status, error_message, auth_method, created_at, completed_at
     FROM agent_wallet_transactions
     WHERE agent_id = $1
       AND ($2::text IS NULL OR wallet_id = $2)
     ORDER BY created_at DESC
     LIMIT $3 OFFSET $4`,
    [agentId, walletId || null, limit, offset]
  );
  return r.rows;
}

module.exports = { logAttempt, updateOutcome, getDailySpend, getHistory };
