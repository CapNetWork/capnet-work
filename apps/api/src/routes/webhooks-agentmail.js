const { pool } = require("../db");

function loadSvixWebhook() {
  try {
    return require("svix").Webhook;
  } catch (e) {
    if (e.code === "MODULE_NOT_FOUND") return null;
    throw e;
  }
}

function extractFromAddress(message) {
  if (!message || typeof message !== "object") return null;
  if (typeof message.from === "string" && message.from.trim()) return message.from.trim();
  if (Array.isArray(message.from_) && message.from_.length > 0) {
    const f = message.from_[0];
    return typeof f === "string" ? f : null;
  }
  return null;
}

/**
 * Express handler: use with express.raw({ type: "application/json" }).
 * Acknowledges immediately; persists message.received asynchronously.
 */
function handleAgentmailWebhook(req, res) {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  const allowSkip =
    process.env.AGENTMAIL_WEBHOOK_SKIP_VERIFY === "1" && process.env.NODE_ENV !== "production";

  let msg;
  try {
    const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    if (allowSkip) {
      msg = JSON.parse(payload.toString("utf8"));
    } else if (!secret) {
      return res.status(503).json({ error: "AGENTMAIL_WEBHOOK_SECRET is not configured" });
    } else {
      const Webhook = loadSvixWebhook();
      if (!Webhook) {
        return res.status(503).json({
          error: "svix package missing in this environment; rebuild the API image or run npm install",
        });
      }
      const wh = new Webhook(secret);
      msg = wh.verify(payload, req.headers);
    }
  } catch (e) {
    return res.status(400).json({ error: "Webhook verification failed" });
  }

  res.status(204).send();

  setImmediate(() => {
    persistInboundEvent(msg).catch((err) => {
      console.error("[agentmail webhook]", err.message);
    });
  });
}

async function persistInboundEvent(msg) {
  if (!msg || msg.event_type !== "message.received" || !msg.message) return;

  const m = msg.message;
  const inboxId = m.inbox_id;
  const eventId = msg.event_id;
  if (!inboxId || !eventId) return;

  const r = await pool.query(
    `SELECT id FROM agents
     WHERE metadata->'integrations'->'agentmail'->>'inbox_id' = $1
     LIMIT 1`,
    [inboxId]
  );
  if (r.rows.length === 0) return;

  const agentId = r.rows[0].id;
  const subject = typeof m.subject === "string" ? m.subject.slice(0, 500) : null;
  const preview = typeof m.preview === "string" ? m.preview.slice(0, 2000) : null;
  const messageId = typeof m.message_id === "string" ? m.message_id.slice(0, 500) : null;
  const fromAddress = extractFromAddress(m);

  await pool.query(
    `INSERT INTO agentmail_inbound_events (
       agent_id, event_id, inbox_id, message_id, subject, preview, from_address
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (event_id) DO NOTHING`,
    [agentId, eventId, inboxId, messageId, subject, preview, fromAddress]
  );
}

module.exports = { handleAgentmailWebhook };
