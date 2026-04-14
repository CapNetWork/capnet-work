const crypto = require("crypto");
const { pool } = require("../db");

const CLAIM_TOKEN_HOURS = 24;
const WEB_BASE_URL = process.env.CLICKR_WEB_URL || "https://www.clickr.cc";

function hashClaimToken(raw) {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Generate a claim token for an agent. Returns { claim_token, claim_url, expires_at }.
 * Only the hash is stored; the raw token is returned to the caller once.
 */
async function generateClaimToken(agentId) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashClaimToken(rawToken);
  const expiresAt = new Date(Date.now() + CLAIM_TOKEN_HOURS * 3600e3);

  await pool.query(
    `INSERT INTO agent_claim_tokens (agent_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [agentId, tokenHash, expiresAt]
  );

  const claimUrl = `${WEB_BASE_URL}/dashboard/claim?token=${rawToken}`;
  return { claim_token: rawToken, claim_url: claimUrl, expires_at: expiresAt.toISOString() };
}

/**
 * Verify and redeem a claim token. Links the agent to the given user.
 * Returns { ok, agent } on success or { ok: false, error, status } on failure.
 */
async function redeemClaimToken(rawToken, userId) {
  const tokenHash = hashClaimToken(rawToken);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const r = await client.query(
      `SELECT ct.id, ct.agent_id, ct.expires_at, ct.claimed_by, ct.claimed_at, a.name AS agent_name, a.owner_id
       FROM agent_claim_tokens ct
       JOIN agents a ON a.id = ct.agent_id
       WHERE ct.token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );

    if (r.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Invalid or expired claim token", status: 404 };
    }

    const row = r.rows[0];

    if (row.claimed_at) {
      await client.query("ROLLBACK");
      return { ok: false, error: "This claim token has already been used", status: 409 };
    }

    if (new Date(row.expires_at) < new Date()) {
      await client.query("ROLLBACK");
      return { ok: false, error: "This claim token has expired", status: 410 };
    }

    if (row.owner_id && row.owner_id !== userId) {
      await client.query("ROLLBACK");
      return { ok: false, error: "This agent is already linked to another account", status: 409 };
    }

    await client.query(
      `UPDATE agents SET owner_id = $1 WHERE id = $2`,
      [userId, row.agent_id]
    );

    await client.query(
      `UPDATE agent_claim_tokens SET claimed_by = $1, claimed_at = now() WHERE id = $2`,
      [userId, row.id]
    );

    await client.query("COMMIT");

    const agent = await pool.query(
      `SELECT id, name, domain, description, avatar_url, metadata, created_at FROM agents WHERE id = $1`,
      [row.agent_id]
    );

    return { ok: true, agent: agent.rows[0] };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { generateClaimToken, redeemClaimToken, hashClaimToken };
