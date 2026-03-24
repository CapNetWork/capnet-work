/**
 * AgentMail: inbox + send via REST; link state in agents.metadata.integrations.agentmail.
 */
const { getProvider } = require("../registry");
const { pick, getProviderConfig, upsertProviderConfig, deleteProviderConfig } = require("../store");
const { createInbox, sendMessage } = require("../../services/agentmail-http");
const { pool } = require("../../db");

const PROVIDER_ID = "agentmail";

/** AgentMail validates client_id; avoid ':' and other characters that trigger 400 ValidationError. */
function idempotentClientId(agentId) {
  const safe = String(agentId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const id = `clickr_agent_${safe}`;
  return id.length > 200 ? id.slice(0, 200) : id;
}

function publicFields() {
  const p = getProvider(PROVIDER_ID);
  return p?.public_fields || [];
}

function requireOrgApiKey() {
  const k = process.env.AGENTMAIL_API_KEY;
  if (!k || typeof k !== "string" || !k.trim()) {
    const e = new Error("AGENTMAIL_NOT_CONFIGURED");
    e.code = "AGENTMAIL_NOT_CONFIGURED";
    throw e;
  }
  return k.trim();
}

function configToPublic(cfg) {
  return pick(cfg, publicFields());
}

/**
 * @returns {Promise<{ connected: boolean, provider: string, config?: object }>}
 */
async function getIntegrationStatus(agentId) {
  const cfg = await getProviderConfig(agentId, PROVIDER_ID);
  if (!cfg?.inbox_id) {
    return { connected: false, provider: PROVIDER_ID };
  }
  return {
    connected: true,
    provider: PROVIDER_ID,
    config: configToPublic(cfg),
  };
}

/**
 * Create or return existing inbox (idempotent via client_id).
 * @param {string} agentId
 * @param {{ username?: string, display_name?: string }} opts
 */
async function link(agentId, opts = {}) {
  const apiKey = requireOrgApiKey();
  const body = {
    client_id: idempotentClientId(agentId),
  };
  if (opts.username && typeof opts.username === "string") {
    body.username = opts.username.trim().slice(0, 64);
  }
  if (opts.display_name && typeof opts.display_name === "string") {
    body.display_name = opts.display_name.trim().slice(0, 200);
  }

  const inbox = await createInbox(apiKey, body);
  const inboxId = inbox.inbox_id ?? inbox.inboxId;
  const email = inbox.email;
  if (!inboxId || !email) {
    const e = new Error("AgentMail create inbox response missing inbox_id or email");
    e.code = "AGENTMAIL_BAD_RESPONSE";
    throw e;
  }

  await upsertProviderConfig(agentId, PROVIDER_ID, {
    status: "active",
    inbox_id: inboxId,
    address: email,
  });

  return {
    ok: true,
    provider: PROVIDER_ID,
    inbox_id: inboxId,
    address: email,
  };
}

/**
 * @param {string} agentId
 * @param {{ to: string, subject: string, text?: string, html?: string, cc?: string[], bcc?: string[] }} payload
 */
async function send(agentId, payload) {
  const apiKey = requireOrgApiKey();
  const cfg = await getProviderConfig(agentId, PROVIDER_ID);
  if (!cfg?.inbox_id) {
    const e = new Error("AgentMail not linked for this agent");
    e.code = "AGENTMAIL_NOT_LINKED";
    e.status = 400;
    throw e;
  }

  const { to, subject, text, html, cc, bcc } = payload;
  const body = { to, subject };
  if (text != null) body.text = text;
  if (html != null) body.html = html;
  if (Array.isArray(cc)) body.cc = cc;
  if (Array.isArray(bcc)) body.bcc = bcc;

  const sent = await sendMessage(apiKey, cfg.inbox_id, body);
  return { ok: true, provider: PROVIDER_ID, message: sent };
}

async function disconnect(agentId) {
  const removed = await deleteProviderConfig(agentId, PROVIDER_ID);
  return { ok: true, provider: PROVIDER_ID, removed };
}

/**
 * Recent rows from agentmail_inbound_events (requires migration 004).
 * @param {string} agentId
 * @param {number} limit
 */
async function listInbound(agentId, limit) {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const r = await pool.query(
    `SELECT id, event_id, inbox_id, message_id, subject, preview, from_address, created_at
     FROM agentmail_inbound_events
     WHERE agent_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [agentId, lim]
  );
  return r.rows;
}

function forbidDirectConfigPut() {
  return true;
}

module.exports = {
  PROVIDER_ID,
  getIntegrationStatus,
  link,
  send,
  disconnect,
  listInbound,
  forbidDirectConfigPut,
};
