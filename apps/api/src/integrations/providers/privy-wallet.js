/**
 * Privy Wallet integration provider.
 * Primary execution path: agent-controlled Solana wallets via Privy's TEE custody.
 */
const { pool } = require("../../db");
const privyDriver = require("../../lib/drivers/privy");
const audit = require("../../lib/wallet-audit");
const walletPolicy = require("../../lib/wallet-policy");
const { refreshScore } = require("../../lib/reputation");

const PROVIDER_ID = "privy_wallet";

function normalizeConnectChainType(input) {
  const raw = typeof input?.chain_type === "string" ? input.chain_type.trim().toLowerCase() : "";
  if (!raw || raw === "solana") {
    return { dbChainType: "solana", chainId: 0, privyChainType: "solana" };
  }
  if (raw === "base" || raw === "evm" || raw === "ethereum") {
    return { dbChainType: "evm", chainId: 8453, privyChainType: "ethereum" };
  }
  const err = new Error("chain_type must be 'solana' or 'base'");
  err.code = "PRIVY_BAD_CHAIN";
  throw err;
}

function normalizeEvmAddress(addr) {
  if (!addr || typeof addr !== "string") return addr;
  const s = addr.trim();
  return s.startsWith("0x") ? s.toLowerCase() : s;
}

async function connect(agentId, input = {}) {
  if (input.action && input.action !== "generate") {
    const err = new Error("Only action 'generate' is supported for Privy wallets");
    err.code = "PRIVY_BAD_ACTION";
    throw err;
  }

  const { dbChainType, chainId, privyChainType } = normalizeConnectChainType(input);
  const wallet = await privyDriver.createWalletForChain(privyChainType);
  const defaultPolicy = dbChainType === "solana" ? { ...walletPolicy.DEFAULT_POLICY } : null;
  const walletAddress = dbChainType === "evm" ? normalizeEvmAddress(wallet.address) : wallet.address;

  const r = await pool.query(
    `INSERT INTO agent_wallets (agent_id, wallet_address, chain_id, chain_type, custody_type,
                                provider_wallet_id, provider_policy_id, label, policy_json)
     VALUES ($1, $2, $3, $4, 'privy', $5, $6, $7, $8::jsonb)
     ON CONFLICT (wallet_address, chain_type, chain_id)
       DO UPDATE SET provider_wallet_id = EXCLUDED.provider_wallet_id,
                     policy_json        = COALESCE(agent_wallets.policy_json, EXCLUDED.policy_json)
     RETURNING id, agent_id, wallet_address, chain_type, custody_type,
               provider_wallet_id, provider_policy_id,
               is_paused, paused_at, paused_reason, policy_json, linked_at`,
    [
      agentId,
      walletAddress,
      chainId,
      dbChainType,
      wallet.providerWalletId,
      wallet.providerPolicyId,
      input.label || null,
      JSON.stringify(defaultPolicy || {}),
    ]
  );

  // Best-effort: also attach the policy to Privy so signing fails closed even
  // if our API is bypassed somehow. Privy's policy SDK shape varies between
  // versions — failures here are non-fatal because the API gate is the trusted one.
  if (dbChainType === "solana" && defaultPolicy) {
    try {
      await privyDriver.updatePolicy(r.rows[0], defaultPolicy);
    } catch (err) {
      if (err && err.code !== "PRIVY_SDK_INCOMPATIBLE") {
        console.warn("[privy-wallet] best-effort policy attach failed:", err.message);
      }
    }
  }

  await audit.logAttempt({
    agentId,
    walletId: r.rows[0].id,
    walletAddress,
    chainType: dbChainType,
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
  const [sol, evm] = await Promise.all([
    pool.query(
      `SELECT id, agent_id, wallet_address, chain_type, custody_type,
              provider_wallet_id, is_paused, paused_at, paused_reason,
              policy_json, linked_at
       FROM agent_wallets
       WHERE agent_id = $1 AND chain_type = 'solana' AND custody_type = 'privy'
       ORDER BY linked_at DESC LIMIT 1`,
      [agentId]
    ),
    pool.query(
      `SELECT id, agent_id, wallet_address, chain_type, custody_type,
              provider_wallet_id, provider_policy_id, linked_at
       FROM agent_wallets
       WHERE agent_id = $1 AND chain_type = 'evm' AND chain_id = 8453 AND custody_type = 'privy'
       ORDER BY linked_at DESC LIMIT 1`,
      [agentId]
    ),
  ]);

  const solWallet = sol.rows[0] || null;
  const baseWallet = evm.rows[0] || null;

  if (!solWallet && !baseWallet) {
    return { connected: false, provider: PROVIDER_ID };
  }

  const wallet = solWallet || baseWallet;
  let balance = null;
  let policy_summary = null;
  let daily_spend_lamports = null;

  if (solWallet) {
    try {
      balance = await privyDriver.getBalance(solWallet.wallet_address);
    } catch {
      /* RPC may be unavailable */
    }
    try {
      const pol = await privyDriver.getPolicy(solWallet);
      if (pol && typeof pol === "object") {
        policy_summary = Object.keys(pol).length ? { keys: Object.keys(pol).slice(0, 12) } : null;
      } else if (pol != null) {
        policy_summary = { raw: String(pol).slice(0, 200) };
      }
    } catch {
      /* policy API optional */
    }
    try {
      daily_spend_lamports = await audit.getDailySpend(agentId, solWallet.id);
    } catch {
      /* non-fatal */
    }
  }

  const effectivePolicy = solWallet ? walletPolicy.getEffectivePolicy(solWallet) : null;
  return {
    connected: true,
    provider: PROVIDER_ID,
    config: {
      wallet_address: solWallet?.wallet_address || null,
      base_wallet_address: baseWallet?.wallet_address || null,
      chain_type: wallet.chain_type,
      custody_type: wallet.custody_type,
      balance_sol: balance ? balance.sol : null,
      policy_summary,
      policy: effectivePolicy,
      daily_spend_lamports,
      is_paused: solWallet ? Boolean(solWallet.is_paused) : false,
      paused_at: solWallet?.paused_at || null,
      paused_reason: solWallet?.paused_reason || null,
      linked_at: wallet.linked_at,
    },
  };
}

async function logBlocked({ agentId, walletRow, txType, authMethod, intent, reason }) {
  try {
    const attempt = await audit.logAttempt({
      agentId,
      walletId: walletRow?.id,
      walletAddress: walletRow?.wallet_address,
      chainType: "solana",
      custodyType: "privy",
      txType,
      amountLamports: intent?.amount_lamports || null,
      destination: intent?.destination || null,
      programId: intent?.program_id || null,
      authMethod,
    });
    await audit.updateOutcome(attempt.id, { status: "blocked", errorMessage: reason });
    return attempt.id;
  } catch (err) {
    console.warn("[privy-wallet] failed to log blocked attempt:", err.message);
    return null;
  }
}

async function sign(agentId, walletRow, input, authMethod) {
  const messageBase64 = input.message;
  if (!messageBase64) {
    const err = new Error("message (base64) is required");
    err.code = "PRIVY_MISSING_MESSAGE";
    throw err;
  }

  // Pause gate (sign also blocked when paused; policy is intentionally not
  // enforced here because signMessage doesn't have program/amount semantics).
  const fresh = (await walletPolicy.loadWalletState(walletRow.id)) || walletRow;
  if (fresh.is_paused) {
    const err = new Error(`Wallet is paused: ${fresh.paused_reason || "wallet_paused"}`);
    err.code = "WALLET_PAUSED";
    err.status = 423;
    await logBlocked({
      agentId,
      walletRow: fresh,
      txType: "sign_message",
      authMethod,
      reason: `wallet_paused: ${fresh.paused_reason || ""}`.slice(0, 400),
    });
    throw err;
  }

  const attempt = await audit.logAttempt({
    agentId,
    walletId: fresh.id,
    walletAddress: fresh.wallet_address,
    chainType: "solana",
    custodyType: "privy",
    txType: "sign_message",
    authMethod,
  });

  try {
    const result = await privyDriver.signMessage(fresh, messageBase64);
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

  // Pause + policy gates run before we even touch Privy. Both record a
  // status='blocked' audit row so operators can see who tried what.
  let enforcement;
  try {
    enforcement = await walletPolicy.enforce(walletRow, {
      amount_lamports: input.amount_lamports,
      destination: input.destination,
      program_id: input.program_id,
    });
  } catch (err) {
    const reasonCode = err.rule || err.code || "blocked";
    const txTypeForBlocked = err.code === "WALLET_PAUSED" ? "send_transaction" : "send_transaction";
    const blockedAttemptId = await logBlocked({
      agentId,
      walletRow,
      txType: txTypeForBlocked,
      authMethod,
      intent: input,
      reason: `${reasonCode}: ${String(err.message || "").slice(0, 300)}`,
    });
    if (err instanceof Error) err.wallet_tx_id = blockedAttemptId;
    throw err;
  }
  const fresh = enforcement.walletRow;

  const attempt = await audit.logAttempt({
    agentId,
    walletId: fresh.id,
    walletAddress: fresh.wallet_address,
    chainType: "solana",
    custodyType: "privy",
    txType: "send_transaction",
    amountLamports: input.amount_lamports || null,
    destination: input.destination || null,
    programId: input.program_id || null,
    authMethod,
  });

  try {
    const result = await privyDriver.signAndSend(fresh, transactionBase64);
    await audit.updateOutcome(attempt.id, {
      txHash: result.txHash,
      status: "submitted",
    });
    await refreshScore(agentId);
    return { ok: true, tx_hash: result.txHash, status: "submitted", wallet_tx_id: attempt.id };
  } catch (err) {
    await audit.updateOutcome(attempt.id, { status: "failed", errorMessage: err.message });
    await refreshScore(agentId);
    const wrapped = err instanceof Error ? err : new Error(String(err));
    wrapped.wallet_tx_id = attempt.id;
    throw wrapped;
  }
}

async function pause(agentId, walletRow, reason, authMethod) {
  const r = await pool.query(
    `UPDATE agent_wallets
     SET is_paused      = true,
         paused_at      = now(),
         paused_reason  = $2
     WHERE id = $1
     RETURNING id, agent_id, wallet_address, is_paused, paused_at, paused_reason`,
    [walletRow.id, (reason || "manual_pause").slice(0, 200)]
  );
  await audit.logAttempt({
    agentId,
    walletId: walletRow.id,
    walletAddress: walletRow.wallet_address,
    chainType: "solana",
    custodyType: "privy",
    txType: "wallet_paused",
    authMethod,
  });
  return r.rows[0];
}

async function resume(agentId, walletRow, authMethod) {
  const r = await pool.query(
    `UPDATE agent_wallets
     SET is_paused      = false,
         paused_at      = NULL,
         paused_reason  = NULL
     WHERE id = $1
     RETURNING id, agent_id, wallet_address, is_paused`,
    [walletRow.id]
  );
  await audit.logAttempt({
    agentId,
    walletId: walletRow.id,
    walletAddress: walletRow.wallet_address,
    chainType: "solana",
    custodyType: "privy",
    txType: "wallet_resumed",
    authMethod,
  });
  return r.rows[0];
}

async function updatePolicy(agentId, walletRow, partial) {
  const fresh = (await walletPolicy.loadWalletState(walletRow.id)) || walletRow;
  const next = walletPolicy.mergePolicyUpdate(fresh.policy_json, partial);
  const r = await pool.query(
    `UPDATE agent_wallets
     SET policy_json = $2::jsonb
     WHERE id = $1
     RETURNING id, agent_id, wallet_address, policy_json`,
    [walletRow.id, JSON.stringify(next)]
  );
  // Best-effort sync to Privy (non-fatal).
  try {
    await privyDriver.updatePolicy(fresh, next);
  } catch (err) {
    if (err && err.code !== "PRIVY_SDK_INCOMPATIBLE") {
      console.warn("[privy-wallet] best-effort policy sync failed:", err.message);
    }
  }
  return { ...r.rows[0], policy: next };
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
  return { action: body.action || "generate", label: body.label, chain_type: body.chain_type };
}

function mapConnectError(err) {
  if (!err) return null;
  if (err.code === "PRIVY_NOT_CONFIGURED") return { status: 503, error: err.message };
  if (err.code === "PRIVY_SDK_INCOMPATIBLE") return { status: 503, error: err.message };
  if (err.code === "PRIVY_BAD_ACTION") return { status: 400, error: err.message };
  if (err.code === "PRIVY_BAD_CHAIN") return { status: 400, error: err.message };
  if (err.code === "PRIVY_MISSING_MESSAGE") return { status: 400, error: err.message };
  if (err.code === "PRIVY_MISSING_TX") return { status: 400, error: err.message };
  if (err.code === "SOLANA_DEVNET_REQUIRED") return { status: 400, error: err.message };
  if (err.code === "SOLANA_BAD_AIRDROP_AMOUNT") return { status: 400, error: err.message };
  if (err.code === "SOLANA_INVALID_ADDRESS") return { status: 400, error: err.message };
  if (err.code === "SOLANA_MISSING_MEMO") return { status: 400, error: err.message };
  if (err.code === "WALLET_PAUSED") return { status: 423, error: err.message };
  if (err.code === "WALLET_POLICY_VIOLATION") {
    return { status: 403, error: err.message, rule: err.rule };
  }
  if (err.code === "WALLET_POLICY_INVALID") return { status: 400, error: err.message };
  // Postgres: undefined_table — migrations not applied (agent_wallets missing).
  if (err.code === "42P01") {
    return {
      status: 503,
      error: "Wallet tables are missing in this environment. Run DB migrations (e.g. npm run db:migrate) and retry.",
    };
  }
  // Postgres: undefined_column — DB is on an older migration than the API expects.
  if (err.code === "42703") {
    return {
      status: 503,
      error:
        "Wallet table schema is outdated in this environment. Apply the latest DB migrations and retry.",
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
  pause,
  resume,
  updatePolicy,
  disconnect,
  forbidDirectConfigPut,
  readConnectInput,
  mapConnectError,
};
