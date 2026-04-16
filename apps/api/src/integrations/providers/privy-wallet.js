/**
 * Privy Wallet integration provider.
 * Primary execution path: agent-controlled Solana wallets via Privy's TEE custody.
 */
const { pool } = require("../../db");
const privyDriver = require("../../lib/drivers/privy");
const audit = require("../../lib/wallet-audit");
const { refreshScore } = require("../../lib/reputation");

const PROVIDER_ID = "privy_wallet";

async function connect(agentId, input = {}) {
  if (input.action && input.action !== "generate") {
    const err = new Error("Only action 'generate' is supported for Privy wallets");
    err.code = "PRIVY_BAD_ACTION";
    throw err;
  }

  const wallet = await privyDriver.createWallet();

  const r = await pool.query(
    `INSERT INTO agent_wallets (agent_id, wallet_address, chain_id, chain_type, custody_type, provider_wallet_id, provider_policy_id, label)
     VALUES ($1, $2, 0, 'solana', 'privy', $3, $4, $5)
     ON CONFLICT (wallet_address, chain_type, chain_id)
       DO UPDATE SET provider_wallet_id = EXCLUDED.provider_wallet_id
     RETURNING id, wallet_address, chain_type, custody_type, linked_at`,
    [agentId, wallet.publicKey, wallet.providerWalletId, wallet.providerPolicyId, input.label || null]
  );

  await audit.logAttempt({
    agentId,
    walletId: r.rows[0].id,
    walletAddress: wallet.publicKey,
    chainType: "solana",
    custodyType: "privy",
    txType: "wallet_created",
    authMethod: input._authMethod || "session",
  });

  return {
    ok: true,
    provider: PROVIDER_ID,
    wallet: r.rows[0],
  };
}

async function getIntegrationStatus(agentId) {
  const r = await pool.query(
    `SELECT id, wallet_address, chain_type, custody_type, provider_wallet_id, linked_at
     FROM agent_wallets
     WHERE agent_id = $1 AND chain_type = 'solana' AND custody_type = 'privy'
     ORDER BY linked_at DESC LIMIT 1`,
    [agentId]
  );
  if (r.rows.length === 0) {
    return { connected: false, provider: PROVIDER_ID };
  }
  const wallet = r.rows[0];
  let balance = null;
  try {
    balance = await privyDriver.getBalance(wallet.wallet_address);
  } catch {
    /* RPC may be unavailable */
  }
  return {
    connected: true,
    provider: PROVIDER_ID,
    config: {
      wallet_address: wallet.wallet_address,
      custody_type: wallet.custody_type,
      balance_sol: balance ? balance.sol : null,
      linked_at: wallet.linked_at,
    },
  };
}

async function sign(agentId, walletRow, input, authMethod) {
  const messageBase64 = input.message;
  if (!messageBase64) {
    const err = new Error("message (base64) is required");
    err.code = "PRIVY_MISSING_MESSAGE";
    throw err;
  }

  const attempt = await audit.logAttempt({
    agentId,
    walletId: walletRow.id,
    walletAddress: walletRow.wallet_address,
    chainType: "solana",
    custodyType: "privy",
    txType: "sign_message",
    authMethod,
  });

  try {
    const result = await privyDriver.signMessage(walletRow, messageBase64);
    await audit.updateOutcome(attempt.id, { status: "confirmed" });
    await refreshScore(agentId);
    return { ok: true, signature: result.signature };
  } catch (err) {
    await audit.updateOutcome(attempt.id, { status: "failed", errorMessage: err.message });
    throw err;
  }
}

async function send(agentId, walletRow, input, authMethod) {
  const transactionBase64 = input.transaction;
  if (!transactionBase64) {
    const err = new Error("transaction (base64) is required");
    err.code = "PRIVY_MISSING_TX";
    throw err;
  }

  const attempt = await audit.logAttempt({
    agentId,
    walletId: walletRow.id,
    walletAddress: walletRow.wallet_address,
    chainType: "solana",
    custodyType: "privy",
    txType: "send_transaction",
    amountLamports: input.amount_lamports || null,
    destination: input.destination || null,
    programId: input.program_id || null,
    authMethod,
  });

  try {
    const result = await privyDriver.signAndSend(walletRow, transactionBase64);
    await audit.updateOutcome(attempt.id, {
      txHash: result.txHash,
      status: "submitted",
    });
    await refreshScore(agentId);
    return { ok: true, tx_hash: result.txHash, status: "submitted" };
  } catch (err) {
    await audit.updateOutcome(attempt.id, { status: "failed", errorMessage: err.message });
    await refreshScore(agentId);
    throw err;
  }
}

async function disconnect(agentId) {
  const r = await pool.query(
    `DELETE FROM agent_wallets
     WHERE agent_id = $1 AND chain_type = 'solana' AND custody_type = 'privy'
     RETURNING id, wallet_address`,
    [agentId]
  );
  if (r.rows.length === 0) {
    return { ok: true, provider: PROVIDER_ID, removed: false };
  }
  for (const row of r.rows) {
    await audit.logAttempt({
      agentId,
      walletId: row.id,
      walletAddress: row.wallet_address,
      chainType: "solana",
      custodyType: "privy",
      txType: "wallet_destroyed",
      authMethod: "session",
    });
  }
  return { ok: true, provider: PROVIDER_ID, removed: true };
}

function forbidDirectConfigPut() {
  return true;
}

function readConnectInput(body) {
  if (!body || typeof body !== "object") return {};
  return { action: body.action || "generate", label: body.label };
}

function mapConnectError(err) {
  if (!err) return null;
  if (err.code === "PRIVY_NOT_CONFIGURED") return { status: 503, error: err.message };
  if (err.code === "PRIVY_BAD_ACTION") return { status: 400, error: err.message };
  if (err.code === "PRIVY_MISSING_MESSAGE") return { status: 400, error: err.message };
  if (err.code === "PRIVY_MISSING_TX") return { status: 400, error: err.message };
  // Postgres: undefined_table — migrations not applied (agent_wallets missing).
  if (err.code === "42P01") {
    return {
      status: 503,
      error: "Wallet tables are missing in this environment. Run DB migrations (e.g. npm run db:migrate) and retry.",
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
};
