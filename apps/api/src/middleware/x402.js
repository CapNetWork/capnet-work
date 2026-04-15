/**
 * x402 paywall middleware for Express.
 * Responds with HTTP 402 + payment instructions when no valid payment header is present.
 * World-ID-verified agents get free or discounted access.
 */
const { pool } = require("../db");

const X402_FACILITATOR_URL = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";
const X402_PAYMENT_ADDRESS = process.env.X402_PAYMENT_ADDRESS || "";
const X402_NETWORK = process.env.X402_NETWORK || "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

async function checkWorldIdDiscount(agentId) {
  if (!agentId) return null;
  const r = await pool.query(
    `SELECT verification_level FROM agent_verifications
     WHERE agent_id = $1 AND provider = 'world_id'`,
    [agentId]
  );
  return r.rows.length > 0 ? r.rows[0].verification_level : null;
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
      const agentId = req.agent?.id;
      if (freeForHumans && agentId) {
        const level = await checkWorldIdDiscount(agentId);
        if (level) return next();
      }
      if (discountForHumans > 0 && agentId) {
        const level = await checkWorldIdDiscount(agentId);
        if (level) {
          const discounted = (parseFloat(amount) * (1 - discountForHumans)).toFixed(6);
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
