const { pool } = require("../db");
const { mergeIntegrationMetadata } = require("./merge");

/**
 * Integration config merge (§12 — chain/payment-agnostic, non-destructive):
 * Always preserves unrelated `agents.metadata` keys and other `metadata.integrations.*`
 * namespaces. Never replace `metadata` with a partial object outside this module.
 */

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

/**
 * Shallow-merge `patch` into `metadata.integrations[providerId]` only; keeps sibling providers intact.
 * @param {string} agentId
 * @param {string} providerId
 * @param {Record<string, unknown>} patch
 */
async function upsertProviderConfig(agentId, providerId, patch) {
  const metadata = await getAgentMetadata(agentId);
  const { nextMetadata, nextProvider } = mergeIntegrationMetadata(metadata, providerId, patch);

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
