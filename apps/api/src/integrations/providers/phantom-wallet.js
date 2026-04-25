/**
 * Phantom — user-owned Solana wallet linked by pubkey (extension / client signs).
 * Sign/send are not server-executed; routes return 501 until a client-side or MCP flow exists.
 */
const { pool } = require("../../db");
const phantomDriver = require("../../lib/drivers/phantom");
const audit = require("../../lib/wallet-audit");
const { refreshScore } = require("../../lib/reputation");

const PROVIDER_ID = "phantom_wallet";

async function connect(agentId, input = {}) {
  const walletAddress = (input.wallet_address || input.walletAddress || "").trim();
  if (!phantomDriver.validateSolanaAddress(walletAddress)) {
    const err = new Error("wallet_address must be a valid Solana address");
    err.code = "PHANTOM_BAD_ADDRESS";
    throw err;
  }

  try {
    const existing = await pool.query(
      `SELECT id, agent_id FROM agent_wallets
       WHERE wallet_address = $1 AND chain_type = 'solana' AND chain_id = 0`,
      [walletAddress]
    );
    if (existing.rows.length > 0 && existing.rows[0].agent_id !== agentId) {
      const err = new Error("This wallet address is already linked to another agent");
      err.code = "PHANTOM_WALLET_TAKEN";
      throw err;
    }

    const r = await pool.query(
      `INSERT INTO agent_wallets (agent_id, wallet_address, chain_id, chain_type, custody_type, label)
       VALUES ($1, $2, 0, 'solana', 'phantom', $3)
       ON CONFLICT (wallet_address, chain_type, chain_id)
       DO UPDATE SET label = COALESCE(EXCLUDED.label, agent_wallets.label)
       WHERE agent_wallets.agent_id = EXCLUDED.agent_id
       RETURNING id, wallet_address, agent_id`,
      [agentId, walletAddress, input.label || null]
    );
    if (r.rows.length === 0) {
      const err = new Error("This wallet address is already linked to another agent");
      err.code = "PHANTOM_WALLET_TAKEN";
      throw err;
    }
    const row = r.rows[0];

    await audit.logAttempt({
      agentId,
      walletId: row.id,
      walletAddress: row.wallet_address,
      chainType: "solana",
      custodyType: "phantom",
      txType: "wallet_linked",
      authMethod: input._authMethod || "session",
    });
    await refreshScore(agentId);

    return {
      ok: true,
      provider: PROVIDER_ID,
      wallet: { id: row.id, wallet_address: row.wallet_address, chain_type: "solana", custody_type: "phantom" },
    };
  } catch (err) {
    if (err.code === "PHANTOM_WALLET_TAKEN") throw err;
    if (err.code === "23505") {
      const e = new Error("Wallet conflict — address may belong to another agent");
      e.code = "PHANTOM_WALLET_TAKEN";
      throw e;
    }
    throw err;
  }
}

async function getIntegrationStatus(agentId) {
  const r = await pool.query(
    `SELECT id, wallet_address, chain_type, custody_type, linked_at
     FROM agent_wallets
     WHERE agent_id = $1 AND chain_type = 'solana' AND custody_type = 'phantom'
     ORDER BY linked_at DESC LIMIT 1`,
    [agentId]
  );
  if (r.rows.length === 0) {
    return { connected: false, provider: PROVIDER_ID };
  }
  const w = r.rows[0];
  return {
    connected: true,
    provider: PROVIDER_ID,
    config: {
      wallet_address: w.wallet_address,
      custody_type: w.custody_type,
      linked_at: w.linked_at,
      signing_note: "Sign/send require Phantom user approval in the client; server routes return not-implemented until wired.",
    },
  };
}

async function requirePhantomWallet(req, res) {
  const r = await pool.query(
    `SELECT id, wallet_address, chain_type, custody_type
     FROM agent_wallets
     WHERE agent_id = $1 AND chain_type = 'solana' AND custody_type = 'phantom'
     ORDER BY linked_at DESC LIMIT 1`,
    [req.agent.id]
  );
  if (r.rows.length === 0) {
    res.status(400).json({ error: "No Phantom-linked wallet. POST /integrations/phantom_wallet/connect first." });
    return null;
  }
  return r.rows[0];
}

async function sign(agentId, walletRow, _input, authMethod) {
  const attempt = await audit.logAttempt({
    agentId,
    walletId: walletRow.id,
    walletAddress: walletRow.wallet_address,
    chainType: "solana",
    custodyType: "phantom",
    txType: "sign_message",
    authMethod,
  });
  try {
    await phantomDriver.signMessage(walletRow, null);
  } catch (err) {
    await audit.updateOutcome(attempt.id, { status: "failed", errorMessage: err.message });
    throw err;
  }
}

async function send(agentId, walletRow, _input, authMethod) {
  const attempt = await audit.logAttempt({
    agentId,
    walletId: walletRow.id,
    walletAddress: walletRow.wallet_address,
    chainType: "solana",
    custodyType: "phantom",
    txType: "send_transaction",
    authMethod,
  });
  try {
    await phantomDriver.signAndSend(walletRow, null);
  } catch (err) {
    await audit.updateOutcome(attempt.id, { status: "failed", errorMessage: err.message });
    throw err;
  }
}

async function disconnect(agentId) {
  const r = await pool.query(
    `DELETE FROM agent_wallets
     WHERE agent_id = $1 AND chain_type = 'solana' AND custody_type = 'phantom'
     RETURNING id, wallet_address`,
    [agentId]
  );
  for (const row of r.rows) {
    await audit.logAttempt({
      agentId,
      walletId: row.id,
      walletAddress: row.wallet_address,
      chainType: "solana",
      custodyType: "phantom",
      txType: "wallet_unlinked",
      authMethod: "session",
    });
  }
  await refreshScore(agentId);
  return { ok: true, provider: PROVIDER_ID, removed: r.rows.length > 0 };
}

function forbidDirectConfigPut() {
  return true;
}

function readConnectInput(body) {
  if (!body || typeof body !== "object") return {};
  return {
    wallet_address: body.wallet_address || body.walletAddress,
    label: body.label,
  };
}

function mapConnectError(err) {
  if (!err) return null;
  if (err.code === "PHANTOM_BAD_ADDRESS") return { status: 400, error: err.message };
  if (err.code === "PHANTOM_WALLET_TAKEN") return { status: 409, error: err.message };
  if (err.code === "PHANTOM_NOT_IMPLEMENTED") return { status: 501, error: err.message };
  if (err.code === "42P01") {
    return {
      status: 503,
      error: "Wallet tables are missing in this environment. Run DB migrations and retry.",
    };
  }
  return null;
}

module.exports = {
  PROVIDER_ID,
  connect,
  getIntegrationStatus,
  sign,
  send,
  disconnect,
  forbidDirectConfigPut,
  readConnectInput,
  mapConnectError,
  requirePhantomWallet,
};
