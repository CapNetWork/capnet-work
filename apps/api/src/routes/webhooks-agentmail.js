const { Router } = require("express");
const { Webhook } = require("standardwebhooks");
const { pool } = require("../db");
const { tryMarkVerifiedFromInbound, VERIFY_SUBJECT } = require("../services/agentmail-provision");
const { notifyExternalInboundEmail } = require("../services/notification-dispatch");

const router = Router();

function normalizeVerifyHeaders(req) {
  return {
    "webhook-id": req.get("svix-id") || req.get("webhook-id"),
    "webhook-timestamp": req.get("svix-timestamp") || req.get("webhook-timestamp"),
    "webhook-signature": req.get("svix-signature") || req.get("webhook-signature"),
  };
}

function extractEmailish(from) {
  if (!from || typeof from !== "string") return "";
  const m = from.match(/<([^>]+)>/);
  const addr = (m ? m[1] : from).trim().toLowerCase();
  return addr;
}

function unwrapEvent(body) {
  if (!body || typeof body !== "object") return null;
  if (body.eventType) return body;
  if (body.data && typeof body.data === "object" && body.data.eventType) return body.data;
  return body.data || body;
}

async function persistInboundMessage(agentId, message, thread) {
  const threadId = thread?.threadId || message?.threadId;
  const messageId = message?.messageId;
  if (!threadId || !messageId) return;

  const fromAddr = extractEmailish(message.from);
  const subject = message.subject || null;
  const excerpt = (message.extractedText || message.text || message.preview || "").slice(0, 2000);

  const t = await pool.query(
    `INSERT INTO agent_agentmail_threads (agent_id, agentmail_thread_id, external_from_email, subject, last_message_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (agent_id, agentmail_thread_id) DO UPDATE SET
       last_message_at = now(),
       external_from_email = COALESCE(EXCLUDED.external_from_email, agent_agentmail_threads.external_from_email),
       subject = COALESCE(EXCLUDED.subject, agent_agentmail_threads.subject)
     RETURNING id`,
    [agentId, threadId, fromAddr || null, subject]
  );
  const threadRowId = t.rows[0].id;

  await pool.query(
    `INSERT INTO agent_agentmail_messages (thread_row_id, agentmail_message_id, direction, subject, text_excerpt, raw_payload_json)
     VALUES ($1, $2, 'inbound', $3, $4, $5)
     ON CONFLICT (thread_row_id, agentmail_message_id) DO NOTHING`,
    [threadRowId, messageId, subject, excerpt, JSON.stringify({ message, thread })]
  );
}

router.post("/agentmail", async (req, res) => {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  const skipVerify = process.env.AGENTMAIL_DEV_SKIP_WEBHOOK_VERIFY === "1";

  const payload = req.body;
  if (!Buffer.isBuffer(payload)) {
    return res.status(400).json({ error: "Expected raw body" });
  }

  let json;
  try {
    if (skipVerify) {
      json = JSON.parse(payload.toString("utf8"));
    } else if (secret && String(secret).trim()) {
      const wh = new Webhook(secret.trim());
      const headers = normalizeVerifyHeaders(req);
      json = wh.verify(payload, headers);
    } else {
      return res.status(503).json({ error: "Webhook signing secret not configured" });
    }
  } catch (e) {
    console.warn("[agentmail webhook] verify failed:", e.message);
    return res.status(400).json({ error: "Invalid webhook" });
  }

  res.status(200).json({ ok: true });

  setImmediate(() => {
    handleAgentMailEvent(json).catch((err) => console.error("[agentmail webhook]", err));
  });
});

async function handleAgentMailEvent(envelope) {
  const event = unwrapEvent(envelope);
  if (!event || event.eventType !== "message.received") return;

  const message = event.message;
  const thread = event.thread;
  const inboxId = message?.inboxId;
  if (!inboxId) return;

  const acc = await pool.query(
    `SELECT agent_id, email_address, status FROM agent_agentmail_accounts WHERE agentmail_inbox_id = $1`,
    [inboxId]
  );
  if (acc.rows.length === 0) return;
  const { agent_id: agentId, email_address: agentEmail, status } = acc.rows[0];

  const text = message.extractedText || message.text || "";
  const subj = message.subject || "";

  if (status === "unverified" && subj.includes(VERIFY_SUBJECT)) {
    await tryMarkVerifiedFromInbound(agentId, text);
  }

  await persistInboundMessage(agentId, message, thread);

  const fromAddr = extractEmailish(message.from);
  const self = (agentEmail || "").toLowerCase();
  const isSelf =
    fromAddr === self ||
    (message.from && String(message.from).toLowerCase().includes(self)) ||
    subj.includes(VERIFY_SUBJECT);
  if (!isSelf && fromAddr) {
    await notifyExternalInboundEmail(agentId, message.from || fromAddr, subj);
  }
}

module.exports = router;
