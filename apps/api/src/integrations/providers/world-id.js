/**
 * World ID integration provider.
 * Badges an agent as "human-backed" via World's proof-of-personhood.
 * Optionally unlocks discounted/free x402 access.
 */
const { pool } = require("../../db");
const { refreshScore } = require("../../lib/reputation");

const PROVIDER_ID = "world_id";
const WORLD_APP_ID = process.env.WORLD_APP_ID || "";
const WORLD_ACTION_ID = process.env.WORLD_ACTION_ID || "verify-agent";

function ensureConfigured() {
  if (!WORLD_APP_ID) {
    const err = new Error("WORLD_APP_ID is not configured");
    err.code = "WORLD_NOT_CONFIGURED";
    throw err;
  }
}

async function verifyProofWithWorldAPI(proof, merkleRoot, nullifierHash, verificationLevel) {
  ensureConfigured();
  const url = `https://developer.worldcoin.org/api/v2/verify/${WORLD_APP_ID}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: WORLD_ACTION_ID,
      proof,
      merkle_root: merkleRoot,
      nullifier_hash: nullifierHash,
      verification_level: verificationLevel,
    }),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    const err = new Error(body.detail || body.message || `World ID verification failed (${resp.status})`);
    err.code = "WORLD_VERIFICATION_FAILED";
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

async function connect(agentId, input = {}) {
  const { proof, merkle_root, nullifier_hash, verification_level } = input;
  if (!proof || !nullifier_hash) {
    const err = new Error("proof and nullifier_hash are required");
    err.code = "WORLD_BAD_INPUT";
    throw err;
  }

  const level = verification_level || "device";

  await verifyProofWithWorldAPI(proof, merkle_root, nullifier_hash, level);

  const existing = await pool.query(
    `SELECT agent_id FROM agent_verifications
     WHERE nullifier_hash = $1 AND provider = 'world_id' AND agent_id != $2`,
    [nullifier_hash, agentId]
  );
  if (existing.rows.length > 0) {
    const err = new Error("This World ID is already linked to another agent");
    err.code = "WORLD_SYBIL";
    throw err;
  }

  await pool.query(
    `INSERT INTO agent_verifications (agent_id, provider, verification_level, nullifier_hash, proof)
     VALUES ($1, 'world_id', $2, $3, $4)
     ON CONFLICT (agent_id, provider)
       DO UPDATE SET verification_level = EXCLUDED.verification_level,
                     nullifier_hash = EXCLUDED.nullifier_hash,
                     proof = EXCLUDED.proof,
                     verified_at = now()`,
    [agentId, level, nullifier_hash, JSON.stringify({ proof, merkle_root, nullifier_hash })]
  );

  await refreshScore(agentId);

  return {
    ok: true,
    provider: PROVIDER_ID,
    verified: true,
    verification_level: level,
  };
}

async function getIntegrationStatus(agentId) {
  const r = await pool.query(
    `SELECT verification_level, verified_at, expires_at
     FROM agent_verifications
     WHERE agent_id = $1 AND provider = 'world_id'`,
    [agentId]
  );
  if (r.rows.length === 0) {
    return { connected: false, provider: PROVIDER_ID };
  }
  const row = r.rows[0];
  return {
    connected: true,
    provider: PROVIDER_ID,
    config: {
      verified: true,
      verification_level: row.verification_level,
      verified_at: row.verified_at,
    },
  };
}

async function disconnect(agentId) {
  const r = await pool.query(
    `DELETE FROM agent_verifications WHERE agent_id = $1 AND provider = 'world_id' RETURNING id`,
    [agentId]
  );
  await refreshScore(agentId);
  return { ok: true, provider: PROVIDER_ID, removed: r.rows.length > 0 };
}

async function isHumanBacked(agentId) {
  const r = await pool.query(
    `SELECT verification_level FROM agent_verifications
     WHERE agent_id = $1 AND provider = 'world_id'`,
    [agentId]
  );
  return r.rows.length > 0 ? r.rows[0].verification_level : null;
}

function forbidDirectConfigPut() {
  return true;
}

function readConnectInput(body) {
  if (!body || typeof body !== "object") return {};
  return {
    proof: body.proof,
    merkle_root: body.merkle_root,
    nullifier_hash: body.nullifier_hash,
    verification_level: body.verification_level,
  };
}

function mapConnectError(err) {
  if (!err) return null;
  if (err.code === "WORLD_NOT_CONFIGURED") return { status: 503, error: err.message };
  if (err.code === "WORLD_BAD_INPUT") return { status: 400, error: err.message };
  if (err.code === "WORLD_VERIFICATION_FAILED") return { status: err.status || 400, error: err.message };
  if (err.code === "WORLD_SYBIL") return { status: 409, error: err.message };
  return null;
}

module.exports = {
  PROVIDER_ID,
  connect,
  getIntegrationStatus,
  disconnect,
  isHumanBacked,
  forbidDirectConfigPut,
  readConnectInput,
  mapConnectError,
};
