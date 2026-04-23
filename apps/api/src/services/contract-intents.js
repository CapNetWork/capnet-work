/**
 * Contract intent lifecycle.
 *
 *   createIntent(...)       — Jupiter /quote + anchor snapshot, status=quoted
 *   scorePaperPnl(id)       — paper PnL pass from latest contract_price_snapshots
 *   simulateIntent(...)     — re-quote + Solana RPC simulateTransaction, always safe
 *   executeIntent(...)      — re-quote with platform fee, Privy-signed swap, links
 *                             wallet_tx_id and persists platform_fee_* + realized PnL
 *
 * On-chain tx state lives in `agent_wallet_transactions` (source of truth).
 * Signing/broadcast is delegated to the existing Privy wallet integration.
 */
const { pool } = require("../db");
const { VersionedTransaction } = require("@solana/web3.js");
const jupiter = require("./jupiter");
const priceTracker = require("./price-tracker");
const platformFee = require("./platform-fee");
const privyWallet = require("../integrations/providers/privy-wallet");
const privyDriver = require("../lib/drivers/privy");

const SOL_MINT = priceTracker.SOL_MINT;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,50}$/;

const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const _idempotency = new Map();

function throwStatus(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function isBase58Mint(mint) {
  return typeof mint === "string" && BASE58_RE.test(mint);
}

function idempotencyGet(key) {
  if (!key) return null;
  const hit = _idempotency.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > IDEMPOTENCY_TTL_MS) {
    _idempotency.delete(key);
    return null;
  }
  return hit.response;
}

function idempotencySet(key, response) {
  if (!key) return;
  _idempotency.set(key, { at: Date.now(), response });
}

async function createIntent({ agentId, contractId, side, amountLamports, slippageBps = 50, walletId = null }) {
  if (!agentId) throwStatus(400, "agentId required");
  if (!contractId) throwStatus(400, "contractId required");
  if (!["buy", "sell"].includes(side)) throwStatus(400, "side must be 'buy' or 'sell'");

  let amt;
  try {
    amt = BigInt(amountLamports);
  } catch {
    throwStatus(400, "amount_lamports must be an integer string or number");
  }
  if (amt <= 0n) throwStatus(400, "amount_lamports must be positive");

  const slippage = Math.max(1, Math.min(2000, parseInt(slippageBps, 10) || 50));

  const contractRes = await pool.query(
    `SELECT id, mint_address FROM token_contracts WHERE id = $1`,
    [contractId]
  );
  if (contractRes.rows.length === 0) throwStatus(404, "Contract not found");
  const mint = contractRes.rows[0].mint_address;
  if (!isBase58Mint(mint)) throwStatus(500, "Contract has invalid mint_address");

  const inputMint = side === "buy" ? SOL_MINT : mint;
  const outputMint = side === "buy" ? mint : SOL_MINT;

  let quote = null;
  let quoteError = null;
  try {
    quote = await jupiter.getQuote({
      inputMint,
      outputMint,
      amount: amt.toString(),
      slippageBps: slippage,
    });
  } catch (err) {
    quoteError = err;
    console.warn(`[contract-intents] quote failed for ${mint} (${side}):`, err.message);
  }

  let anchorSnapshot = null;
  try {
    anchorSnapshot = await priceTracker.snapshot(contractId);
  } catch (err) {
    console.warn("[contract-intents] anchor snapshot failed:", err.message);
  }

  const quotedPriceUsd = anchorSnapshot?.price_usd ?? null;
  const quotedPriceSol = anchorSnapshot?.price_sol ?? null;
  const quoteTimestamp = quote ? new Date() : null;

  const ins = await pool.query(
    `INSERT INTO contract_transaction_intents
       (contract_id, created_by_agent_id, wallet_id,
        side, amount_lamports, input_mint, output_mint, slippage_bps,
        quote_json, quoted_price_usd, quoted_price_sol, quote_timestamp, quote_source,
        status, score_status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'jupiter-v6', $13, 'pending', $14)
     RETURNING *`,
    [
      contractId,
      agentId,
      walletId,
      side,
      amt.toString(),
      inputMint,
      outputMint,
      slippage,
      quote ? JSON.stringify(quote) : null,
      quotedPriceUsd,
      quotedPriceSol,
      quoteTimestamp,
      quote ? "quoted" : "draft",
      quoteError ? `quote_failed: ${quoteError.message.slice(0, 400)}` : null,
    ]
  );
  return ins.rows[0];
}

async function scorePaperPnl(contractId) {
  const latestRes = await pool.query(
    `SELECT price_usd, price_sol FROM contract_price_snapshots
     WHERE contract_id = $1
     ORDER BY captured_at DESC
     LIMIT 1`,
    [contractId]
  );
  if (latestRes.rows.length === 0) return 0;
  const latest = latestRes.rows[0];

  const intents = await pool.query(
    `SELECT id, side, quoted_price_usd, quoted_price_sol
     FROM contract_transaction_intents
     WHERE contract_id = $1 AND score_status != 'resolved'`,
    [contractId]
  );

  let updated = 0;
  for (const row of intents.rows) {
    const bps = computePaperPnlBps(row, latest);
    if (bps == null) continue;
    await pool.query(
      `UPDATE contract_transaction_intents
       SET paper_pnl_bps = $1, score_status = 'paper_scored', updated_at = now()
       WHERE id = $2`,
      [bps, row.id]
    );
    updated += 1;
  }
  return updated;
}

function computePaperPnlBps(intent, latest) {
  const anchor = intent.quoted_price_usd != null ? Number(intent.quoted_price_usd) : null;
  const current = latest.price_usd != null ? Number(latest.price_usd) : null;
  if (!(anchor > 0) || !(current > 0)) return null;
  const deltaPct = (current - anchor) / anchor;
  const directional = intent.side === "buy" ? deltaPct : -deltaPct;
  return Math.round(directional * 10000);
}

// ── Shared loaders ───────────────────────────────────────────────────

async function loadIntent(intentId) {
  const r = await pool.query(
    `SELECT i.*, c.mint_address AS contract_mint, c.decimals AS contract_decimals
     FROM contract_transaction_intents i
     JOIN token_contracts c ON c.id = i.contract_id
     WHERE i.id = $1`,
    [intentId]
  );
  if (r.rows.length === 0) throwStatus(404, "Intent not found");
  return r.rows[0];
}

async function ensureAgentOwnedByUser(agentId, sessionUserId) {
  if (!sessionUserId) return; // Bearer path — skip ownership check.
  const r = await pool.query(`SELECT id, owner_id FROM agents WHERE id = $1`, [agentId]);
  if (r.rows.length === 0) throwStatus(404, "Agent not found");
  if (r.rows[0].owner_id && r.rows[0].owner_id !== sessionUserId) {
    throwStatus(403, "You don't own this agent");
  }
}

async function ensureWallet(intent) {
  if (intent.wallet_id) {
    const r = await pool.query(`SELECT * FROM agent_wallets WHERE id = $1`, [intent.wallet_id]);
    if (r.rows.length === 0) throwStatus(400, "Intent wallet_id not found");
    return r.rows[0];
  }
  const r = await pool.query(
    `SELECT * FROM agent_wallets
     WHERE agent_id = $1 AND chain_type = 'solana' AND custody_type = 'privy'
     ORDER BY linked_at DESC LIMIT 1`,
    [intent.created_by_agent_id]
  );
  if (r.rows.length === 0) {
    throwStatus(
      400,
      "Agent has no Privy Solana wallet. Connect one via POST /integrations/privy_wallet/connect first."
    );
  }
  return r.rows[0];
}

// ── Simulate ─────────────────────────────────────────────────────────

async function simulateIntent({ intentId, sessionUserId, authMethod = "session" }) {
  const intent = await loadIntent(intentId);
  await ensureAgentOwnedByUser(intent.created_by_agent_id, sessionUserId);

  const wallet = await ensureWallet(intent);
  const feeCfg = await platformFee.resolveFeeConfig(intent.output_mint);

  const quote = await jupiter.getQuote({
    inputMint: intent.input_mint,
    outputMint: intent.output_mint,
    amount: intent.amount_lamports,
    slippageBps: intent.slippage_bps,
    platformFeeBps: feeCfg.bps || undefined,
  });

  const swap = await jupiter.getSwapTransaction({
    quote,
    userPublicKey: wallet.wallet_address,
    feeAccount: feeCfg.feeAccount || undefined,
  });

  const conn = privyDriver.getSolanaConnection();
  const txBuf = Buffer.from(swap.swapTransaction, "base64");

  let simulation;
  try {
    const tx = VersionedTransaction.deserialize(txBuf);
    const sim = await conn.simulateTransaction(tx, {
      sigVerify: false,
      commitment: "processed",
      replaceRecentBlockhash: true,
    });
    simulation = {
      ok: sim?.value?.err == null,
      error: sim?.value?.err || null,
      logs: Array.isArray(sim?.value?.logs) ? sim.value.logs.slice(-50) : null,
      units_consumed: sim?.value?.unitsConsumed || null,
    };
  } catch (err) {
    simulation = { ok: false, error: `simulate_failed: ${err.message}`, logs: null, units_consumed: null };
  }

  return {
    intent_id: intent.id,
    side: intent.side,
    input_mint: intent.input_mint,
    output_mint: intent.output_mint,
    quote: {
      in_amount: quote.inAmount,
      out_amount: quote.outAmount,
      other_amount_threshold: quote.otherAmountThreshold,
      price_impact_pct: quote.priceImpactPct,
      slippage_bps: quote.slippageBps,
      platform_fee_bps: feeCfg.bps,
      platform_fee_account: feeCfg.feeAccount,
      platform_fee_reason: feeCfg.reason || null,
    },
    simulation,
    auth_method: authMethod,
  };
}

// ── Execute ──────────────────────────────────────────────────────────

function executeEnabled() {
  const v = (process.env.CLICKR_EXECUTE_ENABLED || "").toLowerCase();
  return v === "true" || v === "1";
}

function executeAllowlist() {
  return (process.env.CLICKR_EXECUTE_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function executeIntent({ intentId, sessionUserId, idempotencyKey, authMethod = "session" }) {
  if (!executeEnabled()) {
    throwStatus(503, "Execute is disabled (CLICKR_EXECUTE_ENABLED is not 'true').");
  }
  if (idempotencyKey) {
    const cached = idempotencyGet(idempotencyKey);
    if (cached) return { ...cached, idempotent_replay: true };
  }

  const intent = await loadIntent(intentId);
  await ensureAgentOwnedByUser(intent.created_by_agent_id, sessionUserId);

  const allowlist = executeAllowlist();
  if (allowlist.length > 0) {
    const allowed =
      allowlist.includes(intent.created_by_agent_id) ||
      (sessionUserId && allowlist.includes(sessionUserId));
    if (!allowed) throwStatus(403, "Agent/user not in CLICKR_EXECUTE_ALLOWLIST");
  }

  // Atomic state transition: quoted|approved -> executing.
  const lock = await pool.query(
    `UPDATE contract_transaction_intents
     SET status = 'executing',
         approved_by = COALESCE(approved_by, $2),
         approved_at = COALESCE(approved_at, now()),
         updated_at  = now()
     WHERE id = $1 AND status IN ('quoted', 'approved')
     RETURNING id`,
    [intentId, sessionUserId || null]
  );
  if (lock.rows.length === 0) {
    throwStatus(409, `Intent is not executable (current status: ${intent.status})`);
  }

  const wallet = await ensureWallet(intent);
  const feeCfg = await platformFee.resolveFeeConfig(intent.output_mint);

  let quote;
  let swap;
  let sendResult;
  let error = null;
  try {
    quote = await jupiter.getQuote({
      inputMint: intent.input_mint,
      outputMint: intent.output_mint,
      amount: intent.amount_lamports,
      slippageBps: intent.slippage_bps,
      platformFeeBps: feeCfg.bps || undefined,
    });
    swap = await jupiter.getSwapTransaction({
      quote,
      userPublicKey: wallet.wallet_address,
      feeAccount: feeCfg.feeAccount || undefined,
    });
    sendResult = await privyWallet.send(
      intent.created_by_agent_id,
      wallet,
      {
        transaction: swap.swapTransaction,
        amount_lamports: intent.amount_lamports,
        program_id: "jupiter-v6",
      },
      authMethod
    );
  } catch (err) {
    error = err;
  }

  if (error) {
    await pool.query(
      `UPDATE contract_transaction_intents
       SET status        = 'failed',
           error_message = $2,
           wallet_tx_id  = COALESCE($3, wallet_tx_id),
           updated_at    = now()
       WHERE id = $1`,
      [intentId, `execute_failed: ${String(error.message || error).slice(0, 400)}`, error.wallet_tx_id || null]
    );
    throwStatus(502, `execute_failed: ${error.message || error}`);
  }

  const feeAmount = platformFee.estimateFeeAmountBaseUnits(quote, feeCfg.bps);
  await pool.query(
    `UPDATE contract_transaction_intents
     SET wallet_tx_id                   = $2,
         platform_fee_bps               = $3,
         platform_fee_amount_base_units = $4,
         platform_fee_mint              = $5,
         platform_fee_account           = $6,
         quote_json                     = $7,
         updated_at                     = now()
     WHERE id = $1`,
    [
      intentId,
      sendResult.wallet_tx_id || null,
      feeCfg.bps || 0,
      feeAmount,
      feeCfg.feeAccount ? intent.output_mint : null,
      feeCfg.feeAccount || null,
      JSON.stringify(quote),
    ]
  );

  // Bounded confirmation poll — if confirmed within ~15s, resolve realized PnL inline.
  const resolved = await waitForConfirm(sendResult.wallet_tx_id, 15000);
  if (resolved?.status === "confirmed") {
    const realizedBps = await computeRealizedPnlBps({ intent, quote });
    await pool.query(
      `UPDATE contract_transaction_intents
       SET status           = 'done',
           score_status     = 'resolved',
           realized_pnl_bps = $2,
           resolved_at      = now(),
           updated_at       = now()
       WHERE id = $1`,
      [intentId, realizedBps]
    );
  }

  const response = {
    intent_id: intentId,
    tx_hash: sendResult.tx_hash,
    wallet_tx_id: sendResult.wallet_tx_id,
    status: resolved?.status === "confirmed" ? "done" : "executing",
    platform_fee_bps: feeCfg.bps,
    platform_fee_amount_base_units: feeAmount,
    platform_fee_mint: feeCfg.feeAccount ? intent.output_mint : null,
    platform_fee_account: feeCfg.feeAccount,
    platform_fee_reason: feeCfg.reason || null,
  };
  idempotencySet(idempotencyKey, response);
  return response;
}

async function waitForConfirm(walletTxId, timeoutMs) {
  if (!walletTxId) return null;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await pool.query(
      `SELECT status, tx_hash FROM agent_wallet_transactions WHERE id = $1`,
      [walletTxId]
    );
    const row = r.rows[0];
    if (!row) return null;
    if (row.status === "confirmed" || row.status === "failed") return row;
    await new Promise((res) => setTimeout(res, 1000));
  }
  return null;
}

async function computeRealizedPnlBps({ intent, quote }) {
  try {
    const anchorUsd = intent.quoted_price_usd != null ? Number(intent.quoted_price_usd) : null;
    if (!(anchorUsd > 0)) return null;

    const priceResp = await jupiter.getPrice([SOL_MINT]);
    const solUsd = priceResp?.data?.[SOL_MINT]?.price;
    if (!solUsd || !quote) return null;
    const decimals = intent.contract_decimals != null ? Number(intent.contract_decimals) : null;
    if (decimals == null) return null;

    const inAmount = Number(quote.inAmount);
    const outAmount = Number(quote.outAmount);
    if (!(inAmount > 0) || !(outAmount > 0)) return null;

    let realizedUsd;
    if (intent.side === "buy") {
      const solIn = inAmount / 1e9;
      const tokensOut = outAmount / Math.pow(10, decimals);
      realizedUsd = (solIn * Number(solUsd)) / tokensOut;
    } else {
      const tokensIn = inAmount / Math.pow(10, decimals);
      const solOut = outAmount / 1e9;
      realizedUsd = (solOut * Number(solUsd)) / tokensIn;
    }
    if (!(realizedUsd > 0)) return null;
    const deltaPct = (realizedUsd - anchorUsd) / anchorUsd;
    const directional = intent.side === "buy" ? deltaPct : -deltaPct;
    return Math.round(directional * 10000);
  } catch (err) {
    console.warn("[contract-intents] realized pnl compute failed:", err.message);
    return null;
  }
}

module.exports = {
  createIntent,
  scorePaperPnl,
  simulateIntent,
  executeIntent,
  computePaperPnlBps,
  isBase58Mint,
  executeEnabled,
  executeAllowlist,
};
