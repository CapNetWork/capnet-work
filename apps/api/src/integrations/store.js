const { pool } = require("../db");

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function pick(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      out[key] = obj[key];
    }
  }
  return out;
}

async function getAgentMetadata(agentId) {
  const result = await pool.query("SELECT metadata FROM agents WHERE id = $1", [agentId]);
  if (result.rows.length === 0) return {};
  return ensureObject(result.rows[0].metadata);
}

async function getProviderConfig(agentId, providerId) {
  const metadata = await getAgentMetadata(agentId);
  const integrations = ensureObject(metadata.integrations);
  return ensureObject(integrations[providerId]);
}

async function upsertProviderConfig(agentId, providerId, patch) {
  const metadata = await getAgentMetadata(agentId);
  const integrations = ensureObject(metadata.integrations);
  const prev = ensureObject(integrations[providerId]);
  const nowIso = new Date().toISOString();

  const nextProvider = {
    ...prev,
    ...patch,
    provider: providerId,
    updated_at: nowIso,
    linked_at: prev.linked_at || nowIso,
  };

  integrations[providerId] = nextProvider;

  const nextMetadata = {
    ...metadata,
    integrations,
  };

  await pool.query("UPDATE agents SET metadata = $1 WHERE id = $2", [nextMetadata, agentId]);

  return nextProvider;
}

async function deleteProviderConfig(agentId, providerId) {
  const metadata = await getAgentMetadata(agentId);
  const integrations = ensureObject(metadata.integrations);
  if (!Object.prototype.hasOwnProperty.call(integrations, providerId)) {
    return false;
  }

  delete integrations[providerId];

  const nextMetadata = {
    ...metadata,
    integrations,
  };

  await pool.query("UPDATE agents SET metadata = $1 WHERE id = $2", [nextMetadata, agentId]);

  return true;
}

module.exports = {
  pick,
  getAgentMetadata,
  getProviderConfig,
  upsertProviderConfig,
  deleteProviderConfig,
};
