/**
 * POST /integrations/moonpay/webhook — raw JSON body (mounted before express.json() in index.js).
 * Idempotent inserts into moonpay_webhook_events.
 */
const crypto = require("crypto");
const { pool } = require("../db");
const { verifyWebhookSignature } = require("./moonpay-crypto");
const { getProviderConfig, upsertProviderConfig } = require("./store");

function webhookSecret() {
  return process.env.MOONPAY_WEBHOOK_SECRET || process.env.MOONPAY_SECRET_KEY || "";
}

function extractAgentId(payload) {
  const data = payload && typeof payload === "object" ? payload.data || payload : {};
  const ext =
    data.externalCustomerId ||
    data.external_customer_id ||
    payload.externalCustomerId ||
    payload.external_customer_id;
  if (ext && typeof ext === "string" && ext.startsWith("agt_")) return ext;
  if (ext && typeof ext === "string") return ext;
  return null;
}

function extractEventId(payload) {
  if (!payload || typeof payload !== "object") return null;
  return payload.id || payload.eventId || payload.event_id || null;
}

async function handleMoonpayWebhook(req, res) {
  const secret = webhookSecret();
  if (!secret) {
    return res.status(503).json({ error: "MOONPAY_WEBHOOK_SECRET or MOONPAY_SECRET_KEY is not configured" });
  }

  const raw = req.body instanceof Buffer ? req.body.toString("utf8") : String(req.body || "");
  const sigHeader = req.get("Moonpay-Signature-V2") || req.get("moonpay-signature-v2") || "";

  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const ok = verifyWebhookSignature(raw, sigHeader, secret);
  if (!ok) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  const eventId = extractEventId(payload) || crypto.randomUUID();
  const agentId = extractAgentId(payload);
  const eventType = payload.type || payload.event || "unknown";

  try {
    const ins = await pool.query(
      `INSERT INTO moonpay_webhook_events (moonpay_event_id, agent_id, event_type, payload, signature_valid)
       VALUES ($1, $2, $3, $4::jsonb, true)
       ON CONFLICT (moonpay_event_id) DO NOTHING
       RETURNING id`,
      [String(eventId), agentId, String(eventType), JSON.stringify(payload)]
    );

    if (agentId && ins.rows.length > 0) {
      const cfg = await getProviderConfig(agentId, "moonpay");
      if (cfg && cfg.connection_status === "connected") {
        await upsertProviderConfig(agentId, "moonpay", {
          last_webhook_at: new Date().toISOString(),
          last_webhook_type: String(eventType),
        });
      }
    }

    return res.status(200).json({ received: true, duplicate: ins.rows.length === 0 });
  } catch (err) {
    if (err.code === "42P01") {
      return res.status(503).json({ error: "moonpay_webhook_events table missing; run DB migrations" });
    }
    console.error("[moonpay-webhook]", err.message);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}

module.exports = { handleMoonpayWebhook };
