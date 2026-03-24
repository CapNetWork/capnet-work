/**
 * AgentMail REST API (Bearer API key). Base: https://api.agentmail.to/v0/
 * @see https://docs.agentmail.to/api-reference
 */

function baseUrl() {
  return String(process.env.AGENTMAIL_API_BASE_URL || "https://api.agentmail.to").replace(/\/$/, "");
}

async function agentmailRequest(apiKey, path, options = {}) {
  const url = `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { _raw: text };
  }
  if (!res.ok) {
    let msg =
      data.message ||
      data.name ||
      data.error ||
      (Array.isArray(data.errors) ? data.errors.map((e) => e?.message || JSON.stringify(e)).join("; ") : null) ||
      (typeof data === "string" ? data : null) ||
      res.statusText;
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function createInbox(apiKey, body) {
  const raw = body || {};
  // API accepts snake_case in OpenAPI; TS SDK uses camelCase — send both for compatibility.
  const payload = { ...raw };
  if (raw.client_id && !raw.clientId) payload.clientId = raw.client_id;
  if (raw.display_name && !raw.displayName) payload.displayName = raw.display_name;
  return agentmailRequest(apiKey, "/v0/inboxes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function sendMessage(apiKey, inboxId, payload) {
  const id = encodeURIComponent(inboxId);
  return agentmailRequest(apiKey, `/v0/inboxes/${id}/messages/send`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

module.exports = { createInbox, sendMessage, baseUrl };
