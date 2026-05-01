/**
 * Phantom — user-owned Solana wallet linked by pubkey (client signs canonical message).
 */
const { pool } = require("../../db");
const phantomDriver = require("../../lib/drivers/phantom");
const audit = require("../../lib/wallet-audit");
const { refreshScore } = require("../../lib/reputation");
const crypto = require("crypto");
const { PublicKey } = require("@solana/web3.js");

const PROVIDER_ID = "phantom_wallet";
const NONCE_TTL_MS = 5 * 60 * 1000;

function canonicalMessage({ agentId, walletAddress, nonce, issuedAtIso }) {
  return [
    "Link Phantom wallet to Clickr agent",
    `Agent ID: ${agentId}`,
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAtIso}`,
  ].join("\n");
}

async function issueNonceForWallet({ agentId, wallet_address: walletRaw, body_agent_id: bodyAgentRaw }) {
  const bodyAgent = String(bodyAgentRaw ?? "").trim();
  if (!bodyAgent || bodyAgent !== String(agentId)) {
    const err = new Error("agent_id must match the authenticated agent");
    err.code = "PHANTOM_AGENT_MISMATCH";
    err.status = 400;
    throw err;
  }
  const walletAddress = String(walletRaw ?? "").trim();
  if (!phantomDriver.validateSolanaAddress(walletAddress)) {
    const err = new Error("wallet_address must be a valid Solana address");
    err.code = "PHANTOM_BAD_ADDRESS";
    throw err;
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const issuedAtIso = new Date().toISOString();
  const message = canonicalMessage({ agentId, walletAddress, nonce, issuedAtIso });
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

  try {
    await pool.query(`DELETE FROM phantom_link_nonces WHERE expires_at < now()`);
    await pool.query(
      `INSERT INTO phantom_link_nonces (nonce, agent_id, wallet_address, message, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [nonce, agentId, walletAddress, message, expiresAt]
    );
  } catch (e) {
    if (e && e.code === "42P01") {
      const err = new Error(
        "phantom_link_nonces table missing. Run database migrations (e.g. 031_phantom_link_nonces.sql) and retry."
      );
      err.code = "PHANTOM_DB_NOT_READY";
      err.status = 503;
      throw err;
    }
    throw e;
  }

  return { nonce, message, expires_at: expiresAt.toISOString(), agent_id: agentId };
}

async function consumePhantomNonce({ nonce, agentId, walletAddress, message }) {
  const nw = String(nonce || "").trim();
  const msg = String(message || "").trim();
  const wal = String(walletAddress || "").trim();
  const aid = String(agentId || "");

  let r;
  try {
    r = await pool.query(
      `UPDATE phantom_link_nonces
       SET consumed_at = now()
       WHERE nonce = $1
         AND agent_id = $2
         AND wallet_address = $3
         AND message = $4
         AND consumed_at IS NULL
         AND expires_at > now()
       RETURNING nonce`,
      [nw, aid, wal, msg]
    );
  } catch (e) {
    if (e && e.code === "42P01") {
      const err = new Error("phantom_link_nonces missing. Run DB migrations.");
      err.code = "PHANTOM_DB_NOT_READY";
      err.status = 503;
      throw err;
    }
    throw e;
  }

  if (r.rows.length > 0) return;

  let prev;
  try {
    prev = await pool.query(
      `SELECT consumed_at FROM phantom_link_nonces WHERE nonce = $1 AND agent_id = $2 LIMIT 1`,
      [nw, aid]
    );
  } catch (e) {
    if (e && e.code === "42P01") {
      const err = new Error("phantom_link_nonces missing. Run DB migrations.");
      err.code = "PHANTOM_DB_NOT_READY";
      err.status = 503;
      throw err;
    }
    throw e;
  }
  if (prev.rows.length > 0 && prev.rows[0].consumed_at) {
    const err = new Error("Nonce was already used. Request a new nonce.");
    err.code = "PHANTOM_NONCE_REUSED";
    err.status = 400;
    throw err;
  }

  const err = new Error("Nonce missing, expired, or message mismatch. Request a new nonce.");
  err.code = "PHANTOM_NONCE_EXPIRED";
  err.status = 400;
  throw err;
}

function verifySignature({ walletAddress, message, signatureBase64 }) {
  const msgBytes = Buffer.from(String(message || ""), "utf8");
  const sigBytes = Buffer.from(String(signatureBase64 || ""), "base64");
  if (sigBytes.length !== 64) return false;
  const pubkeyBytes = Buffer.from(new PublicKey(walletAddress).toBytes());

  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  const keyDer = Buffer.concat([spkiPrefix, pubkeyBytes]);
  const keyObject = crypto.createPublicKey({ key: keyDer, format: "der", type: "spki" });

  return crypto.verify(null, msgBytes, keyObject, sigBytes);
}

async function persistPhantomProof(agentId, { walletAddress, nonce, signature, message }) {
  const proof = {
    phantom_verified_at: new Date().toISOString(),
    phantom_signature: signature,
    phantom_nonce: nonce,
    phantom_wallet_address: walletAddress,
    phantom_message: message.slice(0, 2000),
  };
  await pool.query(
    `UPDATE agents
     SET metadata = jsonb_set(
       COALESCE(metadata, '{}'::jsonb),
       '{phantom_proof}',
       $2::jsonb,
       true
     )
     WHERE id = $1`,
    [agentId, JSON.stringify(proof)]
  );
}

async function connect(agentId, input = {}) {
  const walletAddress = (input.wallet_address || input.walletAddress || "").trim();
  if (!phantomDriver.validateSolanaAddress(walletAddress)) {
    const err = new Error("wallet_address must be a valid Solana address");
    err.code = "PHANTOM_BAD_ADDRESS";
    throw err;
  }

  const nonce = String(input.nonce || "").trim();
  const message = String(input.message || "").trim();
  const signature = String(input.signature || "").trim();
  if (!nonce || !message || !signature) {
    const err = new Error("nonce, message, and signature are required");
    err.code = "PHANTOM_MISSING_PROOF";
    err.status = 400;
    throw err;
  }

  if (!verifySignature({ walletAddress, message, signatureBase64: signature })) {
    const err = new Error("Signature did not verify for this wallet address");
    err.code = "PHANTOM_BAD_SIGNATURE";
    err.status = 401;
    throw err;
  }

  await consumePhantomNonce({ nonce, agentId, walletAddress, message });

  try {
    const existing = await pool.query(
      `SELECT id, agent_id FROM agent_wallets
       WHERE wallet_address = $1 AND chain_type = 'solana' AND chain_id = 0`,
      [walletAddress]
    );
    if (existing.rows.length > 0 && existing.rows[0].agent_id !== agentId) {
      const err = new Error("This wallet address is already linked to another agent");
      err.code = "PHANTOM_WALLET_TAKEN";
      throw err;
    }

    const r = await pool.query(
      `INSERT INTO agent_wallets (agent_id, wallet_address, chain_id, chain_type, custody_type, label)
       VALUES ($1, $2, 0, 'solana', 'phantom', $3)
       ON CONFLICT (wallet_address, chain_type, chain_id)
       DO UPDATE SET label = COALESCE(EXCLUDED.label, agent_wallets.label)
       WHERE agent_wallets.agent_id = EXCLUDED.agent_id
       RETURNING id, wallet_address, agent_id`,
      [agentId, walletAddress, input.label || null]
    );
    if (r.rows.length === 0) {
      const err = new Error("This wallet address is already linked to another agent");
      err.code = "PHANTOM_WALLET_TAKEN";
      throw err;
    }
    const row = r.rows[0];

    await persistPhantomProof(agentId, { walletAddress, nonce, signature, message });

    await audit.logAttempt({
      agentId,
      walletId: row.id,
      walletAddress: row.wallet_address,
      chainType: "solana",
      custodyType: "phantom",
      txType: "wallet_linked",
      authMethod: input._authMethod || "session",
    });
    await refreshScore(agentId);

    return {
      ok: true,
      provider: PROVIDER_ID,
      wallet: { id: row.id, wallet_address: row.wallet_address, chain_type: "solana", custody_type: "phantom" },
    };
  } catch (err) {
    if (err.code === "PHANTOM_WALLET_TAKEN") throw err;
    if (err.code === "23505") {
      const e = new Error("Wallet conflict — address may belong to another agent");
      e.code = "PHANTOM_WALLET_TAKEN";
      throw e;
    }
    throw err;
  }
}

async function getIntegrationStatus(agentId) {
  const [wRow, proofRow] = await Promise.all([
    pool.query(
      `SELECT id, wallet_address, chain_type, custody_type, linked_at
       FROM agent_wallets
       WHERE agent_id = $1 AND chain_type = 'solana' AND custody_type = 'phantom'
       ORDER BY linked_at DESC LIMIT 1`,
      [agentId]
    ),
    pool.query(
      `SELECT metadata->'phantom_proof'->>'phantom_verified_at' AS phantom_verified_at
       FROM agents WHERE id = $1`,
      [agentId]
    ),
  ]);

  if (wRow.rows.length === 0) {
    return { connected: false, provider: PROVIDER_ID };
  }
  const w = wRow.rows[0];
  const phantomVerifiedAt = proofRow.rows[0]?.phantom_verified_at || null;
  return {
    connected: true,
    provider: PROVIDER_ID,
    config: {
      wallet_address: w.wallet_address,
      custody_type: w.custody_type,
      linked_at: w.linked_at,
      phantom_verified_at: phantomVerifiedAt,
      signing_note: "Sign/send require Phantom user approval in the client; server routes return not-implemented until wired.",
    },
  };
}

async function requirePhantomWallet(req, res) {
  const r = await pool.query(
    `SELECT id, wallet_address, chain_type, custody_type
     FROM agent_wallets
     WHERE agent_id = $1 AND chain_type = 'solana' AND custody_type = 'phantom'
     ORDER BY linked_at DESC LIMIT 1`,
    [req.agent.id]
  );
  if (r.rows.length === 0) {
    res.status(400).json({ error: "No Phantom-linked wallet. POST /integrations/phantom_wallet/connect first." });
    return null;
  }
  return r.rows[0];
}

async function sign(agentId, walletRow, _input, authMethod) {
  const attempt = await audit.logAttempt({
    agentId,
    walletId: walletRow.id,
    walletAddress: walletRow.wallet_address,
    chainType: "solana",
    custodyType: "phantom",
    txType: "sign_message",
    authMethod,
  });
  try {
    await phantomDriver.signMessage(walletRow, null);
  } catch (err) {
    await audit.updateOutcome(attempt.id, { status: "failed", errorMessage: err.message });
    throw err;
  }
}

async function send(agentId, walletRow, _input, authMethod) {
  const attempt = await audit.logAttempt({
    agentId,
    walletId: walletRow.id,
    walletAddress: walletRow.wallet_address,
    chainType: "solana",
    custodyType: "phantom",
    txType: "send_transaction",
    authMethod,
  });
  try {
    await phantomDriver.signAndSend(walletRow, null);
  } catch (err) {
    await audit.updateOutcome(attempt.id, { status: "failed", errorMessage: err.message });
    throw err;
  }
}

async function disconnect(agentId) {
  const r = await pool.query(
    `DELETE FROM agent_wallets
     WHERE agent_id = $1 AND chain_type = 'solana' AND custody_type = 'phantom'
     RETURNING id, wallet_address`,
    [agentId]
  );
  for (const row of r.rows) {
    await audit.logAttempt({
      agentId,
      walletId: row.id,
      walletAddress: row.wallet_address,
      chainType: "solana",
      custodyType: "phantom",
      txType: "wallet_unlinked",
      authMethod: "session",
    });
  }
  await refreshScore(agentId);
  await pool.query(
    `UPDATE agents
     SET metadata = metadata - 'phantom_proof'
     WHERE id = $1`,
    [agentId]
  ).catch(() => {});
  return { ok: true, provider: PROVIDER_ID, removed: r.rows.length > 0 };
}

function forbidDirectConfigPut() {
  return true;
}

function readConnectInput(body) {
  if (!body || typeof body !== "object") return {};
  return {
    wallet_address: body.wallet_address || body.walletAddress,
    label: body.label,
    nonce: body.nonce,
    message: body.message,
    signature: body.signature,
  };
}

function mapConnectError(err) {
  if (!err) return null;
  if (err.code === "PHANTOM_BAD_ADDRESS") return { status: 400, error: err.message };
  if (err.code === "PHANTOM_AGENT_MISMATCH") return { status: 400, error: err.message };
  if (err.code === "PHANTOM_WALLET_TAKEN") return { status: 409, error: err.message };
  if (err.code === "PHANTOM_NOT_IMPLEMENTED") return { status: 501, error: err.message };
  if (err.code === "PHANTOM_MISSING_PROOF") return { status: 400, error: err.message };
  if (err.code === "PHANTOM_NONCE_EXPIRED") return { status: 400, error: err.message };
  if (err.code === "PHANTOM_NONCE_REUSED") return { status: 400, error: err.message };
  if (err.code === "PHANTOM_BAD_SIGNATURE") return { status: 401, error: err.message };
  if (err.code === "PHANTOM_DB_NOT_READY") return { status: err.status || 503, error: err.message };
  if (err.code === "42P01") {
    return {
      status: 503,
      error: "Wallet tables are missing in this environment. Run DB migrations and retry.",
    };
  }
  return null;
}

module.exports = {
  PROVIDER_ID,
  connect,
  getIntegrationStatus,
  sign,
  send,
  disconnect,
  forbidDirectConfigPut,
  readConnectInput,
  mapConnectError,
  requirePhantomWallet,
  issueNonceForWallet,
};
