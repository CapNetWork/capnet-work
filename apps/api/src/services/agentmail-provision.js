const crypto = require("crypto");
const { pool } = require("../db");
const { getClient, isConfigured } = require("./agentmail-client");

const VERIFY_SUBJECT = "Verify your Clickr agent mailbox";

/** Inbox-scoped keys (e.g. `am_us_inbox_...`) cannot create new inboxes — AgentMail returns 403. */
function isLikelyInboxScopedKey() {
  const k = process.env.AGENTMAIL_API_KEY || "";
  return /_inbox_/i.test(k);
}

function provisionForbiddenHint(originalMessage) {
  let m = String(originalMessage || "");
  if (/403|Forbidden/i.test(m) && isLikelyInboxScopedKey()) {
    m +=
      " | Clickr hint: this key looks inbox-scoped (`…_inbox_…`). Use an organization API key from AgentMail Console → API Keys (ability to create inboxes), not a per-inbox secret.";
  } else if (/403|Forbidden/i.test(m)) {
    m +=
      " | Check AgentMail Console: org API key, billing/plan limits, and that the key can create inboxes.";
  }
  return m;
}

function inboxUsernameForAgent(agent) {
  const idPart = String(agent.id).replace(/^agt_/, "").slice(0, 10);
  const base = String(agent.name || "agent")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);
  const u = `${base || "agent"}-${idPart}`.replace(/^-/, "");
  return u.slice(0, 48);
}

function domainOption() {
  const d = process.env.AGENTMAIL_INBOX_DOMAIN;
  if (d && String(d).trim()) return String(d).trim();
  return undefined;
}

function generateVerificationCode() {
  return crypto.randomInt(10000000, 100000000).toString();
}

/**
 * Create AgentMail inbox, persist row, send self-addressed verification email.
 * @param {object} agent — row with id, name
 */
async function provisionAgentMail(agent) {
  if (!isConfigured()) {
    return null;
  }
  const client = getClient();
  const username = inboxUsernameForAgent(agent);
  const domain = domainOption();
  const req = {
    username,
    displayName: agent.name || "Clickr agent",
    clientId: agent.id,
  };
  if (domain) req.domain = domain;

  let inbox;
  try {
    inbox = await client.inboxes.create(req);
  } catch (err) {
    const msg = provisionForbiddenHint(err.message || err).slice(0, 2000);
    try {
      await pool.query(
        `INSERT INTO agent_agentmail_accounts (
           agent_id, agentmail_inbox_id, email_address, inbox_username, inbox_domain,
           status, provision_error, updated_at
         ) VALUES ($1, $2, $3, $4, $5, 'provision_failed', $6, now())
         ON CONFLICT (agent_id) DO UPDATE SET
           status = 'provision_failed',
           provision_error = EXCLUDED.provision_error,
           updated_at = now()`,
        [agent.id, "error", "", username, domain || null, msg]
      );
    } catch (dbErr) {
      console.error("[agentmail] provision_failed persist:", dbErr.message);
    }
    const wrapped = new Error(msg);
    wrapped.cause = err;
    throw wrapped;
  }

  const emailAddress = inbox.email;
  const inboxId = inbox.inboxId;
  const code = generateVerificationCode();

  await pool.query(
    `INSERT INTO agent_agentmail_accounts (
       agent_id, agentmail_inbox_id, email_address, inbox_username, inbox_domain,
       status, verification_code, provision_error, updated_at
     ) VALUES ($1, $2, $3, $4, $5, 'unverified', $6, NULL, now())
     ON CONFLICT (agent_id) DO UPDATE SET
       agentmail_inbox_id = EXCLUDED.agentmail_inbox_id,
       email_address = EXCLUDED.email_address,
       inbox_username = EXCLUDED.inbox_username,
       inbox_domain = EXCLUDED.inbox_domain,
       status = 'unverified',
       verification_code = EXCLUDED.verification_code,
       verified_at = NULL,
       provision_error = NULL,
       updated_at = now()`,
    [agent.id, inboxId, emailAddress, username, domain || null, code]
  );

  try {
    await sendVerificationEmailInternal(client, inboxId, emailAddress, code);
  } catch (sendErr) {
    const sm = String(sendErr.message || sendErr).slice(0, 2000);
    await pool.query(
      `UPDATE agent_agentmail_accounts SET status = 'error', provision_error = $1, updated_at = now() WHERE agent_id = $2`,
      [sm, agent.id]
    );
    throw sendErr;
  }

  return {
    email_address: emailAddress,
    inbox_id: inboxId,
    status: "unverified",
    verified_at: null,
  };
}

async function sendVerificationEmailInternal(client, inboxId, toEmail, code) {
  await client.inboxes.messages.send(inboxId, {
    to: toEmail,
    subject: VERIFY_SUBJECT,
    text: `Your Clickr mailbox verification code is: ${code}\n\nIf you did not create this agent, you can ignore this message.`,
  });
}

/** Re-send verification (rate-limit at route layer if needed). */
async function resendVerification(agentId) {
  const client = getClient();
  const r = await pool.query(
    `SELECT agentmail_inbox_id, email_address, status, verification_code
     FROM agent_agentmail_accounts WHERE agent_id = $1`,
    [agentId]
  );
  if (r.rows.length === 0) throw new Error("No mailbox for this agent");
  const row = r.rows[0];
  if (row.status === "verified") return { ok: true, already: true };
  const code = row.verification_code || generateVerificationCode();
  if (!row.verification_code) {
    await pool.query(`UPDATE agent_agentmail_accounts SET verification_code = $1, updated_at = now() WHERE agent_id = $2`, [
      code,
      agentId,
    ]);
  }
  await sendVerificationEmailInternal(client, row.agentmail_inbox_id, row.email_address, code);
  return { ok: true };
}

async function tryMarkVerifiedFromInbound(agentId, text) {
  if (!text || typeof text !== "string") return false;
  const r = await pool.query(
    `SELECT verification_code, status FROM agent_agentmail_accounts WHERE agent_id = $1`,
    [agentId]
  );
  if (r.rows.length === 0 || r.rows[0].status === "verified") return false;
  const expected = r.rows[0].verification_code;
  if (!expected) return false;
  if (!text.includes(expected)) return false;
  await pool.query(
    `UPDATE agent_agentmail_accounts SET status = 'verified', verified_at = now(), verification_code = NULL, updated_at = now()
     WHERE agent_id = $1`,
    [agentId]
  );
  return true;
}

/** Manual verification when webhooks are unavailable. */
async function verifyWithCode(agentId, code) {
  const trimmed = String(code || "").trim();
  if (!trimmed) throw new Error("code is required");
  const r = await pool.query(
    `SELECT verification_code, status FROM agent_agentmail_accounts WHERE agent_id = $1`,
    [agentId]
  );
  if (r.rows.length === 0) throw new Error("No mailbox for this agent");
  if (r.rows[0].status === "verified") return { ok: true, already: true };
  if (r.rows[0].verification_code !== trimmed) throw new Error("Invalid verification code");
  await pool.query(
    `UPDATE agent_agentmail_accounts SET status = 'verified', verified_at = now(), verification_code = NULL, updated_at = now()
     WHERE agent_id = $1`,
    [agentId]
  );
  return { ok: true };
}

module.exports = {
  provisionAgentMail,
  resendVerification,
  tryMarkVerifiedFromInbound,
  verifyWithCode,
  inboxUsernameForAgent,
  VERIFY_SUBJECT,
};
