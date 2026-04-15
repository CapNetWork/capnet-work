/**
 * x402 Payments integration provider.
 * Manages an agent's payment wallet config and exposes ledger/stats.
 */
const { pool } = require("../../db");
const { getProviderConfig, upsertProviderConfig, deleteProviderConfig } = require("../store");
const { refreshScore } = require("../../lib/reputation");

const PROVIDER_ID = "x402";

async function connect(agentId, input = {}) {
  const paymentWallet = input.payment_wallet;
  if (!paymentWallet || typeof paymentWallet !== "string") {
    const err = new Error("payment_wallet address is required");
    err.code = "X402_BAD_INPUT";
    throw err;
  }

  const saved = await upsertProviderConfig(agentId, PROVIDER_ID, {
    payment_wallet: paymentWallet.trim(),
  });

  return {
    ok: true,
    provider: PROVIDER_ID,
    config: { payment_wallet: saved.payment_wallet, linked_at: saved.linked_at },
  };
}

async function getIntegrationStatus(agentId) {
  const cfg = await getProviderConfig(agentId, PROVIDER_ID);
  if (!cfg || !cfg.payment_wallet) {
    return { connected: false, provider: PROVIDER_ID };
  }

  const stats = await getPaymentStats(agentId);

  return {
    connected: true,
    provider: PROVIDER_ID,
    config: {
      payment_wallet: cfg.payment_wallet,
      total_earned: stats.total_earned,
      total_spent: stats.total_spent,
      linked_at: cfg.linked_at,
    },
  };
}

async function getPaymentStats(agentId) {
  const earned = await pool.query(
    `SELECT COALESCE(SUM(amount::numeric), 0) AS total
     FROM agent_payment_events
     WHERE agent_id = $1 AND direction = 'inbound' AND status = 'settled'`,
    [agentId]
  );
  const spent = await pool.query(
    `SELECT COALESCE(SUM(amount::numeric), 0) AS total
     FROM agent_payment_events
     WHERE agent_id = $1 AND direction = 'outbound' AND status = 'settled'`,
    [agentId]
  );
  return {
    total_earned: earned.rows[0].total.toString(),
    total_spent: spent.rows[0].total.toString(),
  };
}

async function getLedger(agentId, { limit = 50, offset = 0 } = {}) {
  const r = await pool.query(
    `SELECT id, direction, counterparty_agent_id, resource_path, amount, token, network, tx_hash, status, created_at
     FROM agent_payment_events
     WHERE agent_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [agentId, limit, offset]
  );
  return r.rows;
}

async function disconnect(agentId) {
  const removed = await deleteProviderConfig(agentId, PROVIDER_ID);
  return { ok: true, provider: PROVIDER_ID, removed };
}

function readConnectInput(body) {
  if (!body || typeof body !== "object") return {};
  return { payment_wallet: body.payment_wallet };
}

function mapConnectError(err) {
  if (!err) return null;
  if (err.code === "X402_BAD_INPUT") return { status: 400, error: err.message };
  return null;
}

module.exports = {
  PROVIDER_ID,
  connect,
  getIntegrationStatus,
  getPaymentStats,
  getLedger,
  disconnect,
  readConnectInput,
  mapConnectError,
};
