/**
 * x402 paywall middleware for Express.
 * Responds with HTTP 402 + payment instructions when no valid payment header is present.
 * World-ID-verified agents get free or discounted access.
 */
const { pool } = require("../db");

const X402_FACILITATOR_URL = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";
const X402_PAYMENT_ADDRESS = process.env.X402_PAYMENT_ADDRESS;
const X402_NETWORK = process.env.X402_NETWORK || "eip155:8453";
const X402_ASSET_ADDRESS =
  process.env.X402_ASSET_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base
const X402_ASSET_DECIMALS = Number(process.env.X402_ASSET_DECIMALS || 6);

function isZeroEvmAddress(addr) {
  if (!addr || typeof addr !== "string") return false;
  return /^0x0{40}$/i.test(addr.trim());
}

function requireConfiguredPaymentAddress() {
  const a = typeof X402_PAYMENT_ADDRESS === "string" ? X402_PAYMENT_ADDRESS.trim() : "";
  if (!a) {
    const err = new Error("X402_PAYMENT_ADDRESS is required to accept x402 payments");
    err.code = "X402_MISCONFIGURED";
    throw err;
  }
  if (isZeroEvmAddress(a)) {
    const err = new Error("X402_PAYMENT_ADDRESS must not be the zero address");
    err.code = "X402_MISCONFIGURED";
    throw err;
  }
  return a;
}

/**
 * Phase 1: platform wallet only.
 * Phase 2: return seller payment_wallet || platform wallet.
 */
function looksLikeEvmAddress(addr) {
  if (!addr || typeof addr !== "string") return false;
  const s = addr.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(s) && !isZeroEvmAddress(s);
}

async function resolvePayTo({ sellerAgentId } = {}) {
  // Priority:
  // 1) agent integrations.x402.payment_wallet
  // 2) agent Privy Base wallet (chain_type='evm', chain_id=8453, custody='privy')
  // 3) platform X402_PAYMENT_ADDRESS fallback
  if (sellerAgentId) {
    try {
      const r = await pool.query("SELECT metadata FROM agents WHERE id = $1", [sellerAgentId]);
      const metadata = r.rows[0]?.metadata && typeof r.rows[0].metadata === "object" ? r.rows[0].metadata : {};
      const integ = metadata.integrations && typeof metadata.integrations === "object" ? metadata.integrations : {};
      const xcfg = integ.x402 && typeof integ.x402 === "object" ? integ.x402 : {};
      const configured = typeof xcfg.payment_wallet === "string" ? xcfg.payment_wallet.trim() : "";
      if (looksLikeEvmAddress(configured)) return configured;
    } catch {
      /* fall through */
    }

    try {
      const w = await pool.query(
        `SELECT wallet_address
         FROM agent_wallets
         WHERE agent_id = $1 AND chain_type = 'evm' AND chain_id = 8453 AND custody_type = 'privy'
         ORDER BY linked_at DESC LIMIT 1`,
        [sellerAgentId]
      );
      const addr = typeof w.rows[0]?.wallet_address === "string" ? w.rows[0].wallet_address.trim() : "";
      if (looksLikeEvmAddress(addr)) return addr;
    } catch {
      /* fall through */
    }
  }

  return requireConfiguredPaymentAddress();
}

async function checkWorldIdDiscount(agentId) {
  if (!agentId) return null;
  const r = await pool.query(
    `SELECT verification_level FROM agent_verifications
     WHERE agent_id = $1 AND provider = 'world_id'`,
    [agentId]
  );
  return r.rows.length > 0 ? r.rows[0].verification_level : null;
}

function toBase64Json(obj) {
  return Buffer.from(JSON.stringify(obj), "utf-8").toString("base64");
}

function fromBase64Json(b64) {
  const raw = Buffer.from(String(b64), "base64").toString("utf-8");
  return JSON.parse(raw);
}

function parseUsdcToAtomic(amount) {
  // Supports "0", "1", "0.01", "1.234567" (up to decimals).
  const s = String(amount).trim();
  if (!s) throw new Error("amount is required");
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("amount must be a non-negative decimal string");
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(X402_ASSET_DECIMALS)).slice(0, X402_ASSET_DECIMALS);
  const atomic = BigInt(whole) * BigInt(10 ** X402_ASSET_DECIMALS) + BigInt(fracPadded || "0");
  return atomic.toString();
}

function buildPaymentRequirements({ amountAtomic, token, resourceUrl, method, payTo }) {
  return {
    scheme: "exact",
    network: X402_NETWORK,
    amount: String(amountAtomic),
    asset: X402_ASSET_ADDRESS,
    payTo,
    maxTimeoutSeconds: 60,
    // Bazaar-style I/O schema hint used by discovery tooling.
    outputSchema: {
      input: { type: "http", method: (method || "POST").toUpperCase(), resource: resourceUrl },
      output: null,
    },
    extra: { name: token, facilitator: X402_FACILITATOR_URL, version: "2" },
  };
}

function setPaymentRequiredHeaders(res, { amountAtomic, token, resourceUrl, method, payTo }) {
  // x402 transport header (base64 PaymentRequired object)
  const paymentRequired = {
    x402Version: 2,
    error: "PAYMENT-SIGNATURE header is required",
    resource: {
      url: resourceUrl,
      description: "Protected endpoint",
      mimeType: "application/json",
    },
    accepts: [
      buildPaymentRequirements({ amountAtomic, token, resourceUrl, method, payTo }),
    ],
  };

  // MPPscan validators commonly expect WWW-Authenticate: Payment,
  // while x402 clients expect PAYMENT-REQUIRED.
  res.setHeader("WWW-Authenticate", "Payment");
  res.setHeader("PAYMENT-REQUIRED", toBase64Json(paymentRequired));
}

function setPaymentResponseHeaders(res, settlementResponse) {
  res.setHeader("PAYMENT-RESPONSE", toBase64Json(settlementResponse));
}

async function reserveReplayNonce({ network, nonce }) {
  // This table is created by migration 027_x402_payment_receipts.sql.
  // If it is missing, we fail closed because replay protection is required.
  await pool.query(
    `INSERT INTO x402_payment_receipts (network, nonce)
     VALUES ($1, $2)`,
    [network, nonce]
  );
}

async function logPaymentEvent({
  agentId,
  direction,
  resourcePath,
  amountAtomic,
  txHash,
  counterpartyAgentId,
  status = "settled",
}) {
  await pool.query(
    `INSERT INTO agent_payment_events
       (agent_id, direction, counterparty_agent_id, resource_path, amount, token, network, tx_hash, status)
     VALUES ($1, $2, $3, $4, $5, 'USDC', $6, $7, $8)`,
    [agentId, direction, counterpartyAgentId || null, resourcePath, String(amountAtomic), X402_NETWORK, txHash, status]
  );
}

function normalizeFacilitatorBase(url) {
  return String(url || "").replace(/\/$/, "");
}

async function facilitatorVerifyAndSettle({ paymentPayload, paymentRequirements }) {
  const base = normalizeFacilitatorBase(X402_FACILITATOR_URL);
  const reqBody = {
    x402Version: 2,
    paymentPayload,
    paymentRequirements,
  };

  const verifyResp = await fetch(`${base}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqBody),
  });
  const verifyJson = await verifyResp.json().catch(() => ({}));
  if (!verifyResp.ok || verifyJson?.isValid !== true) {
    const err = new Error(verifyJson?.invalidReason || "x402 verification failed");
    err.code = "X402_VERIFY_FAILED";
    err.details = verifyJson;
    throw err;
  }

  const settleResp = await fetch(`${base}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqBody),
  });
  const settleJson = await settleResp.json().catch(() => ({}));
  if (!settleResp.ok || settleJson?.success !== true || !settleJson?.transaction) {
    const err = new Error(settleJson?.errorReason || "x402 settlement failed");
    err.code = "X402_SETTLE_FAILED";
    err.details = settleJson;
    throw err;
  }

  return settleJson;
}

function extractReplayNonce(paymentPayload) {
  const nonce =
    paymentPayload?.payload?.authorization?.nonce ||
    paymentPayload?.payload?.nonce ||
    paymentPayload?.nonce ||
    null;
  if (!nonce || typeof nonce !== "string") return null;
  return nonce.trim() || null;
}

function paymentRequiredResponseBody({ amountAtomic, displayAmount, token, payTo, discountMeta }) {
  return {
    error: "Payment required",
    amount: displayAmount,
    amount_atomic: String(amountAtomic),
    token,
    network: X402_NETWORK,
    asset: X402_ASSET_ADDRESS,
    pay_to: payTo,
    facilitator: X402_FACILITATOR_URL,
    ...(discountMeta || {}),
  };
}

function x402Paywall({ amount, token = "USDC", freeForHumans = false, discountForHumans = 0 } = {}) {
  return async (req, res, next) => {
    const paymentSig = req.headers["payment-signature"] || req.headers["x-payment-signature"];
    const sellerAgentId = req.params?.agentId || null;
    const buyerAgentId = req.agent?.id || null;
    const resourcePath = req.originalUrl || req.path;
    const resourceUrl = `${req.protocol}://${req.get("host")}${resourcePath}`;

    let payTo;
    try {
      payTo = await resolvePayTo({ sellerAgentId, buyerAgentId, req });
    } catch (e) {
      return res.status(503).json({ error: e.message || "x402 is not configured" });
    }

    // Amount=0 endpoints are effectively free; don't prompt for payment.
    let baseAmountAtomic;
    try {
      baseAmountAtomic = parseUsdcToAtomic(amount);
    } catch (e) {
      return res.status(500).json({ error: e.message || "Invalid x402 amount configuration" });
    }
    if (baseAmountAtomic === "0") return next();

    if (!paymentSig) {
      if (freeForHumans && buyerAgentId) {
        const level = await checkWorldIdDiscount(buyerAgentId);
        if (level) return next();
      }
      if (discountForHumans > 0 && buyerAgentId) {
        const level = await checkWorldIdDiscount(buyerAgentId);
        if (level) {
          const discounted = (parseFloat(amount) * (1 - discountForHumans)).toFixed(6);
          const discountedAtomic = parseUsdcToAtomic(discounted);
          setPaymentRequiredHeaders(res, {
            amountAtomic: discountedAtomic,
            token,
            resourceUrl,
            method: req.method,
            payTo,
          });
          return res.status(402).json(
            paymentRequiredResponseBody({
              amountAtomic: discountedAtomic,
              displayAmount: discounted,
              token,
              payTo,
              discountMeta: {
                original_amount: String(amount),
                original_amount_atomic: baseAmountAtomic,
                discount: `${discountForHumans * 100}% (World ID verified)`,
              },
            })
          );
        }
      }

      setPaymentRequiredHeaders(res, {
        amountAtomic: baseAmountAtomic,
        token,
        resourceUrl,
        method: req.method,
        payTo,
      });
      return res.status(402).json(
        paymentRequiredResponseBody({
          amountAtomic: baseAmountAtomic,
          displayAmount: String(amount),
          token,
          payTo,
        })
      );
    }

    try {
      let paymentPayload;
      try {
        paymentPayload = fromBase64Json(paymentSig);
      } catch {
        return res.status(400).json({ error: "Invalid PAYMENT-SIGNATURE header (expected base64 JSON)" });
      }

      // The server is authoritative: only accept the payment requirement we challenged with.
      const expectedReq = buildPaymentRequirements({
        amountAtomic: baseAmountAtomic,
        token,
        resourceUrl,
        method: req.method,
        payTo,
      });

      // Replay protection: reserve the nonce before settling.
      const nonce = extractReplayNonce(paymentPayload);
      if (!nonce) return res.status(400).json({ error: "Payment payload missing nonce (replay protection required)" });
      try {
        await reserveReplayNonce({ network: X402_NETWORK, nonce });
      } catch (e) {
        if (e?.code === "23505") {
          return res.status(402).json({ error: "Payment already used (replay detected)" });
        }
        throw e;
      }

      const settlement = await facilitatorVerifyAndSettle({
        paymentPayload,
        paymentRequirements: expectedReq,
      });

      const txHash = settlement.transaction;

      // Internal attribution even when payTo is the platform wallet.
      if (buyerAgentId) {
        await logPaymentEvent({
          agentId: buyerAgentId,
          direction: "outbound",
          counterpartyAgentId: sellerAgentId,
          resourcePath,
          amountAtomic: baseAmountAtomic,
          txHash,
          status: "settled",
        });
      }
      if (sellerAgentId) {
        await logPaymentEvent({
          agentId: sellerAgentId,
          direction: "inbound",
          counterpartyAgentId: buyerAgentId,
          resourcePath,
          amountAtomic: baseAmountAtomic,
          txHash,
          status: "settled",
        });
      }

      setPaymentResponseHeaders(res, {
        success: true,
        payer: settlement.payer || null,
        transaction: txHash,
        network: settlement.network || X402_NETWORK,
      });

      next();
    } catch (err) {
      if (err.code === "X402_VERIFY_FAILED" || err.code === "X402_SETTLE_FAILED") {
        setPaymentRequiredHeaders(res, {
          amountAtomic: baseAmountAtomic,
          token,
          resourceUrl,
          method: req.method,
          payTo,
        });
        return res.status(402).json({ error: err.message || "Payment failed", code: err.code, details: err.details || null });
      }
      next(err);
    }
  };
}

module.exports = { x402Paywall, logPaymentEvent, resolvePayTo };
