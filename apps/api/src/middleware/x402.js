/**
 * x402 paywall middleware for Express.
 * Responds with HTTP 402 + payment instructions when no valid payment header is present.
 * World-ID-verified agents get free or discounted access.
 */
const { pool } = require("../db");

const X402_FACILITATOR_URL = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";
const X402_PAYMENT_ADDRESS =
  process.env.X402_PAYMENT_ADDRESS || "0x0000000000000000000000000000000000000000";
const X402_NETWORK = process.env.X402_NETWORK || "eip155:8453";
const X402_ASSET_ADDRESS =
  process.env.X402_ASSET_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base

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

function setPaymentRequiredHeaders(res, { amount, token, resourceUrl, method }) {
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
      {
        scheme: "exact",
        network: X402_NETWORK,
        amount: String(amount),
        asset: X402_ASSET_ADDRESS,
        payTo: X402_PAYMENT_ADDRESS,
        maxTimeoutSeconds: 60,
        // Bazaar-style I/O schema hint used by discovery tooling.
        outputSchema: {
          input: { type: "http", method: (method || "POST").toUpperCase(), resource: resourceUrl },
          output: null,
        },
        extra: { name: token, facilitator: X402_FACILITATOR_URL, version: "2" },
      },
    ],
  };

  // MPPscan validators commonly expect WWW-Authenticate: Payment,
  // while x402 clients expect PAYMENT-REQUIRED.
  res.setHeader("WWW-Authenticate", "Payment");
  res.setHeader("PAYMENT-REQUIRED", toBase64Json(paymentRequired));
}

async function logPaymentEvent(agentId, direction, resourcePath, amount, txHash) {
  await pool.query(
    `INSERT INTO agent_payment_events
       (agent_id, direction, resource_path, amount, token, network, tx_hash, status)
     VALUES ($1, $2, $3, $4, 'USDC', $5, $6, 'settled')`,
    [agentId, direction, resourcePath, amount, X402_NETWORK, txHash || null]
  );
}

function x402Paywall({ amount, token = "USDC", freeForHumans = false, discountForHumans = 0 } = {}) {
  return async (req, res, next) => {
    const paymentSig = req.headers["payment-signature"] || req.headers["x-payment-signature"];

    if (!paymentSig) {
      const resourceUrl = `${req.protocol}://${req.get("host")}${req.originalUrl || req.path}`;
      const agentId = req.agent?.id;
      if (freeForHumans && agentId) {
        const level = await checkWorldIdDiscount(agentId);
        if (level) return next();
      }
      if (discountForHumans > 0 && agentId) {
        const level = await checkWorldIdDiscount(agentId);
        if (level) {
          const discounted = (parseFloat(amount) * (1 - discountForHumans)).toFixed(6);
          setPaymentRequiredHeaders(res, { amount: discounted, token, resourceUrl, method: req.method });
          return res.status(402).json({
            error: "Payment required",
            amount: discounted,
            original_amount: amount,
            discount: `${discountForHumans * 100}% (World ID verified)`,
            token,
            network: X402_NETWORK,
            pay_to: X402_PAYMENT_ADDRESS,
            facilitator: X402_FACILITATOR_URL,
          });
        }
      }

      setPaymentRequiredHeaders(res, { amount, token, resourceUrl, method: req.method });
      return res.status(402).json({
        error: "Payment required",
        amount,
        token,
        network: X402_NETWORK,
        pay_to: X402_PAYMENT_ADDRESS,
        facilitator: X402_FACILITATOR_URL,
      });
    }

    try {
      const buyerAgentId = req.agent?.id || null;
      const resourcePath = req.originalUrl || req.path;

      await logPaymentEvent(buyerAgentId, "outbound", resourcePath, amount, null);

      const sellerAgentId = req.params?.agentId || null;
      if (sellerAgentId) {
        await logPaymentEvent(sellerAgentId, "inbound", resourcePath, amount, null);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { x402Paywall, logPaymentEvent };
