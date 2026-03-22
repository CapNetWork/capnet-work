const { AgentMailClient } = require("agentmail");

function isConfigured() {
  return Boolean(process.env.AGENTMAIL_API_KEY && String(process.env.AGENTMAIL_API_KEY).trim());
}

let _client;

function getClient() {
  if (!isConfigured()) {
    throw new Error("AGENTMAIL_API_KEY is not configured");
  }
  if (!_client) {
    _client = new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY.trim() });
  }
  return _client;
}

module.exports = { getClient, isConfigured };
