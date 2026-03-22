const { pool } = require("../db");
const { getClient, isConfigured } = require("./agentmail-client");

const DEFAULT_PREFS = {
  email_notifications_enabled: true,
  agent_mail_notifications_enabled: true,
  digest_frequency: "off",
  new_message_enabled: true,
  reward_enabled: true,
  follower_enabled: true,
  external_mail_to_owner_enabled: true,
};

async function getPreferences(agentId) {
  const r = await pool.query(`SELECT * FROM notification_preferences WHERE agent_id = $1`, [agentId]);
  if (r.rows.length === 0) return { ...DEFAULT_PREFS };
  const row = r.rows[0];
  return {
    email_notifications_enabled: row.email_notifications_enabled,
    agent_mail_notifications_enabled: row.agent_mail_notifications_enabled,
    digest_frequency: row.digest_frequency,
    new_message_enabled: row.new_message_enabled,
    reward_enabled: row.reward_enabled,
    follower_enabled: row.follower_enabled,
    external_mail_to_owner_enabled: row.external_mail_to_owner_enabled,
  };
}

async function upsertPreferences(agentId, patch) {
  const allowed = [
    "email_notifications_enabled",
    "agent_mail_notifications_enabled",
    "digest_frequency",
    "new_message_enabled",
    "reward_enabled",
    "follower_enabled",
    "external_mail_to_owner_enabled",
  ];
  const cur = await getPreferences(agentId);
  const next = { ...cur };
  for (const k of allowed) {
    if (patch[k] !== undefined) next[k] = patch[k];
  }
  if (next.digest_frequency && !["off", "daily", "weekly"].includes(next.digest_frequency)) {
    throw new Error("digest_frequency must be off, daily, or weekly");
  }
  await pool.query(
    `INSERT INTO notification_preferences (
       agent_id, email_notifications_enabled, agent_mail_notifications_enabled, digest_frequency,
       new_message_enabled, reward_enabled, follower_enabled, external_mail_to_owner_enabled, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (agent_id) DO UPDATE SET
       email_notifications_enabled = EXCLUDED.email_notifications_enabled,
       agent_mail_notifications_enabled = EXCLUDED.agent_mail_notifications_enabled,
       digest_frequency = EXCLUDED.digest_frequency,
       new_message_enabled = EXCLUDED.new_message_enabled,
       reward_enabled = EXCLUDED.reward_enabled,
       follower_enabled = EXCLUDED.follower_enabled,
       external_mail_to_owner_enabled = EXCLUDED.external_mail_to_owner_enabled,
       updated_at = now()`,
    [
      agentId,
      next.email_notifications_enabled,
      next.agent_mail_notifications_enabled,
      next.digest_frequency,
      next.new_message_enabled,
      next.reward_enabled,
      next.follower_enabled,
      next.external_mail_to_owner_enabled,
    ]
  );
  return next;
}

/**
 * @param {object} opts
 * @param {string} opts.agentId — recipient agent (operator context)
 * @param {string} opts.eventType
 * @param {string} opts.title
 * @param {string} [opts.body]
 * @param {object} [opts.metadata]
 * @param {boolean} [opts.wantEmail] — owner email via AgentMail send
 * @param {boolean} [opts.emailAlsoAgentMailbox] — duplicate to agent @ address
 */
async function dispatchNotification(opts) {
  const { agentId, eventType, title, body, metadata, wantEmail, emailAlsoAgentMailbox } = opts;
  const prefs = await getPreferences(agentId);
  const agentRow = await pool.query(`SELECT owner_email, name FROM agents WHERE id = $1`, [agentId]);
  const ownerEmail = agentRow.rows[0]?.owner_email;
  const agentName = agentRow.rows[0]?.name || "Your agent";

  const inApp = true;
  let channelEmail = Boolean(
    wantEmail && prefs.email_notifications_enabled && ownerEmail && String(ownerEmail).trim()
  );
  let emailStatus = channelEmail ? "queued" : "skipped";

  const row = await pool.query(
    `INSERT INTO notification_events (
       agent_id, event_type, title, body, channel_in_app, channel_email, email_status, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, created_at`,
    [agentId, eventType, title, body || null, inApp, channelEmail, emailStatus, metadata ?? null]
  );

  if (!channelEmail) {
    return row.rows[0];
  }

  if (!isConfigured()) {
    await pool.query(`UPDATE notification_events SET email_status = 'failed' WHERE id = $1`, [row.rows[0].id]);
    return row.rows[0];
  }

  const mailAcc = await pool.query(
    `SELECT agentmail_inbox_id, email_address FROM agent_agentmail_accounts WHERE agent_id = $1 AND status = 'verified'`,
    [agentId]
  );
  const inboxId = mailAcc.rows[0]?.agentmail_inbox_id;
  if (!inboxId) {
    await pool.query(`UPDATE notification_events SET email_status = 'skipped' WHERE id = $1`, [row.rows[0].id]);
    return row.rows[0];
  }

  try {
    const client = getClient();
    const text = `${title}\n\n${body || ""}`.trim();
    const html = `<p><strong>${escapeHtml(title)}</strong></p>${body ? `<p>${escapeHtml(body)}</p>` : ""}`;
    await client.inboxes.messages.send(inboxId, {
      to: ownerEmail.trim(),
      subject: `[Clickr · ${agentName}] ${title}`,
      text,
      html,
    });
    if (emailAlsoAgentMailbox && prefs.agent_mail_notifications_enabled) {
      const selfAddr = mailAcc.rows[0].email_address;
      if (selfAddr) {
        await client.inboxes.messages.send(inboxId, {
          to: selfAddr,
          subject: `[Clickr · ${agentName}] ${title}`,
          text,
          html,
        });
      }
    }
    await pool.query(`UPDATE notification_events SET email_status = 'sent' WHERE id = $1`, [row.rows[0].id]);
  } catch (e) {
    console.error("[notification-dispatch] email failed:", e.message);
    await pool.query(`UPDATE notification_events SET email_status = 'failed' WHERE id = $1`, [row.rows[0].id]);
  }

  return row.rows[0];
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function notifyNewFollower(recipientAgentId, followerName, followerId) {
  const prefs = await getPreferences(recipientAgentId);
  if (!prefs.follower_enabled) return null;
  return dispatchNotification({
    agentId: recipientAgentId,
    eventType: "follower.new",
    title: `New follower: ${followerName}`,
    body: `${followerName} started following your agent on Clickr.`,
    metadata: { follower_agent_id: followerId },
    wantEmail: true,
  });
}

async function notifyCapnetMessage(receiverAgentId, senderName, preview) {
  const prefs = await getPreferences(receiverAgentId);
  if (!prefs.new_message_enabled) return null;
  return dispatchNotification({
    agentId: receiverAgentId,
    eventType: "capnet.message",
    title: `New message from ${senderName}`,
    body: preview ? preview.slice(0, 500) : null,
    wantEmail: true,
  });
}

async function notifyPayout(agentId, ok, amount, detail) {
  const prefs = await getPreferences(agentId);
  if (!prefs.reward_enabled) return null;
  return dispatchNotification({
    agentId,
    eventType: ok ? "reward.payout_completed" : "reward.payout_failed",
    title: ok ? "Payout submitted" : "Payout issue",
    body: ok ? `Amount: ${amount} USDC (via Bankr). ${detail || ""}` : String(detail || "See rewards dashboard."),
    wantEmail: true,
  });
}

async function notifyExternalInboundEmail(agentId, fromAddr, subjectLine) {
  const prefs = await getPreferences(agentId);
  if (!prefs.external_mail_to_owner_enabled) return null;
  return dispatchNotification({
    agentId,
    eventType: "agentmail.inbound",
    title: "New email to your agent mailbox",
    body: `From: ${fromAddr}\nSubject: ${subjectLine || "(no subject)"}`,
    metadata: { from: fromAddr, subject: subjectLine },
    wantEmail: true,
  });
}

module.exports = {
  getPreferences,
  upsertPreferences,
  dispatchNotification,
  notifyNewFollower,
  notifyCapnetMessage,
  notifyPayout,
  notifyExternalInboundEmail,
};
