/**
 * Reputation engine — converts audit trail + verifications + payments
 * into a single trust score on the agents table.
 *
 * Scoring model (v1):
 *   +10  verified paid execution (tx confirmed + payment settled)
 *   +5   successful audited transaction (confirmed onchain)
 *   -10  failed transaction
 *   +20  World ID human-backed badge (one-time)
 *   +1   per completed x402 payment received above threshold
 *   Events older than 30 days count at 50%
 */
const { pool } = require("../db");

const WEIGHTS = {
  PAID_EXECUTION: 10,
  SUCCESSFUL_TX: 5,
  FAILED_TX: -10,
  WORLD_ID_BADGE: 20,
  PAYMENT_RECEIVED: 1,
};

const RECENCY_CUTOFF_DAYS = 30;

async function computeScore(agentId) {
  let score = 0;

  const txRows = await pool.query(
    `SELECT status, created_at FROM agent_wallet_transactions
     WHERE agent_id = $1 AND tx_type = 'send_transaction'`,
    [agentId]
  );

  const now = Date.now();
  const cutoff = RECENCY_CUTOFF_DAYS * 86400000;

  for (const row of txRows.rows) {
    const age = now - new Date(row.created_at).getTime();
    const weight = age > cutoff ? 0.5 : 1.0;

    if (row.status === "confirmed") {
      score += WEIGHTS.SUCCESSFUL_TX * weight;
    } else if (row.status === "failed") {
      score += WEIGHTS.FAILED_TX * weight;
    }
  }

  const paymentRows = await pool.query(
    `SELECT direction, amount, created_at FROM agent_payment_events
     WHERE agent_id = $1 AND status = 'settled'`,
    [agentId]
  );

  for (const row of paymentRows.rows) {
    const age = now - new Date(row.created_at).getTime();
    const weight = age > cutoff ? 0.5 : 1.0;

    if (row.direction === "inbound") {
      score += WEIGHTS.PAYMENT_RECEIVED * weight;
    }
  }

  const paidExecRows = await pool.query(
    `SELECT COUNT(*) AS cnt FROM agent_wallet_transactions t
     JOIN agent_payment_events p ON p.agent_id = t.agent_id
       AND p.status = 'settled'
       AND p.direction = 'inbound'
       AND p.created_at BETWEEN t.created_at - interval '5 minutes' AND t.created_at + interval '5 minutes'
     WHERE t.agent_id = $1
       AND t.tx_type = 'send_transaction'
       AND t.status = 'confirmed'`,
    [agentId]
  );
  score += Number(paidExecRows.rows[0].cnt) * WEIGHTS.PAID_EXECUTION;

  const verif = await pool.query(
    `SELECT provider FROM agent_verifications WHERE agent_id = $1`,
    [agentId]
  );
  if (verif.rows.some((r) => r.provider === "world_id")) {
    score += WEIGHTS.WORLD_ID_BADGE;
  }

  return Math.max(0, Math.round(score));
}

async function refreshScore(agentId) {
  const score = await computeScore(agentId);
  await pool.query(
    `UPDATE agents SET trust_score = $1, reputation_updated_at = now() WHERE id = $2`,
    [score, agentId]
  );
  return score;
}

module.exports = { computeScore, refreshScore, WEIGHTS };
