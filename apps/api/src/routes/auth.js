/**
 * /auth — unified sign-in (Google, Apple, wallet SIWE) + session + agent management.
 * All three methods produce the same clickr_sessions token.
 */
const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { OAuth2Client } = require("google-auth-library");
const appleSignin = require("apple-signin-auth");
const { pool } = require("../db");
const {
  issueNonce,
  verifySiweMessage,
  normalizeWallet,
  addressForDb,
} = require("../lib/siwe-proof-store");
const { createUserAndSession, resolveConnectSession } = require("../connect/session");
const { generateClaimToken, redeemClaimToken } = require("../lib/claim-tokens");
const onboardingRewardPayout = require("../services/onboarding-reward-payout");

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID;

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many sign-in attempts" },
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findOrCreateUserByOAuth(provider, providerSub, email, profileData) {
  const existing = await pool.query(
    `SELECT user_id FROM clickr_oauth_identities WHERE provider = $1 AND provider_sub = $2`,
    [provider, providerSub]
  );
  if (existing.rows.length > 0) {
    const userId = existing.rows[0].user_id;
    const u = await pool.query(
      `SELECT id, email, email_verified_at, created_at FROM clickr_users WHERE id = $1`,
      [userId]
    );
    return u.rows[0] || null;
  }

  // Try matching by verified email
  if (email) {
    const byEmail = await pool.query(
      `SELECT id, email, email_verified_at, created_at FROM clickr_users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    if (byEmail.rows.length > 0) {
      const user = byEmail.rows[0];
      await pool.query(
        `INSERT INTO clickr_oauth_identities (user_id, provider, provider_sub, email, profile_data)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (provider, provider_sub) DO NOTHING`,
        [user.id, provider, providerSub, email, JSON.stringify(profileData || {})]
      );
      return user;
    }
  }

  // Create new user
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const u = await client.query(
      `INSERT INTO clickr_users (email, email_verified_at)
       VALUES ($1, $2)
       RETURNING id, email, email_verified_at, created_at`,
      [email || null, email ? new Date().toISOString() : null]
    );
    const user = u.rows[0];
    await client.query(
      `INSERT INTO clickr_oauth_identities (user_id, provider, provider_sub, email, profile_data)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, provider, providerSub, email, JSON.stringify(profileData || {})]
    );
    await client.query("COMMIT");
    return user;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function findOrCreateUserByWallet(walletAddress, chainId) {
  const addrDb = addressForDb(walletAddress);
  const existing = await pool.query(
    `SELECT user_id FROM clickr_linked_wallets WHERE LOWER(address) = LOWER($1) AND chain_id = $2`,
    [addrDb, chainId]
  );
  if (existing.rows.length > 0) {
    const userId = existing.rows[0].user_id;
    const u = await pool.query(
      `SELECT id, email, email_verified_at, created_at FROM clickr_users WHERE id = $1`,
      [userId]
    );
    return u.rows[0] || null;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const u = await client.query(
      `INSERT INTO clickr_users (email) VALUES (NULL) RETURNING id, email, email_verified_at, created_at`
    );
    const user = u.rows[0];
    await client.query(
      `INSERT INTO clickr_linked_wallets (user_id, address, chain_id, wallet_type, verified_at)
       VALUES ($1, $2, $3, 'unknown', now())
       ON CONFLICT (user_id, address, chain_id) DO UPDATE SET verified_at = now()`,
      [user.id, addrDb, chainId]
    );
    await client.query("COMMIT");
    return user;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function createSession(userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const crypto = require("crypto");
    const { hashToken, SESSION_DAYS } = require("../connect/session");
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
    await client.query(
      `INSERT INTO clickr_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
    await client.query("COMMIT");
    return { session_token: rawToken, expires_at: expiresAt.toISOString() };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function requireSession() {
  return async (req, res, next) => {
    const resolved = await resolveConnectSession(req);
    if (!resolved) {
      return res.status(401).json({
        error: "Session required. Sign in via POST /auth/google, /auth/apple, or /auth/wallet.",
      });
    }
    req.clickrUser = resolved.user;
    next();
  };
}

const needSession = requireSession();

// ---------------------------------------------------------------------------
// POST /auth/google
// ---------------------------------------------------------------------------

router.post("/google", authLimiter, async (req, res, next) => {
  if (!googleClient) {
    return res.status(503).json({ error: "Google sign-in is not configured (GOOGLE_CLIENT_ID)" });
  }
  const idToken = typeof req.body?.id_token === "string" ? req.body.id_token.trim() : "";
  if (!idToken) return res.status(400).json({ error: "id_token is required" });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub) {
      return res.status(401).json({ error: "Invalid Google token" });
    }

    const user = await findOrCreateUserByOAuth("google", payload.sub, payload.email, {
      name: payload.name,
      picture: payload.picture,
      email_verified: payload.email_verified,
    });
    if (!user) return res.status(500).json({ error: "Failed to resolve user" });

    const session = await createSession(user.id);
    return res.json({ user, ...session });
  } catch (err) {
    if (err.message?.includes("Token used too late") || err.message?.includes("Invalid token")) {
      return res.status(401).json({ error: "Google token expired or invalid" });
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /auth/apple
// ---------------------------------------------------------------------------

router.post("/apple", authLimiter, async (req, res, next) => {
  if (!APPLE_CLIENT_ID) {
    return res.status(503).json({ error: "Apple sign-in is not configured (APPLE_CLIENT_ID)" });
  }
  const idToken = typeof req.body?.id_token === "string" ? req.body.id_token.trim() : "";
  if (!idToken) return res.status(400).json({ error: "id_token is required" });

  try {
    const payload = await appleSignin.verifyIdToken(idToken, {
      audience: APPLE_CLIENT_ID,
      ignoreExpiration: false,
    });
    if (!payload || !payload.sub) {
      return res.status(401).json({ error: "Invalid Apple token" });
    }

    const user = await findOrCreateUserByOAuth("apple", payload.sub, payload.email, {
      email_verified: payload.email_verified,
      real_user_status: payload.real_user_status,
    });
    if (!user) return res.status(500).json({ error: "Failed to resolve user" });

    const session = await createSession(user.id);
    return res.json({ user, ...session });
  } catch (err) {
    if (err.message?.includes("expired") || err.message?.includes("invalid")) {
      return res.status(401).json({ error: "Apple token expired or invalid" });
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Wallet sign-in (SIWE -> session)
// ---------------------------------------------------------------------------

router.get("/siwe/nonce", (_req, res) => {
  return res.json(issueNonce());
});

// ---------------------------------------------------------------------------
// Solana wallet sign-in (Phantom -> session)
// ---------------------------------------------------------------------------

const SOLANA_NONCE_TTL_MS = 5 * 60 * 1000;
const solanaNonces = new Map(); // nonce -> { message, expiresAt }

function cleanupSolanaNonces() {
  const ts = Date.now();
  for (const [nonce, entry] of solanaNonces.entries()) {
    if (!entry || entry.expiresAt <= ts) solanaNonces.delete(nonce);
  }
}

function issueSolanaNonce({ domain }) {
  const crypto = require("crypto");
  cleanupSolanaNonces();
  const nonce = crypto.randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SOLANA_NONCE_TTL_MS).toISOString();
  const message = [
    "Clickr Sign-in (Solana)",
    `domain=${domain || "clickr.cc"}`,
    `nonce=${nonce}`,
    `issued_at=${issuedAt}`,
    `expires_at=${expiresAt}`,
  ].join("\n");
  solanaNonces.set(nonce, { message, expiresAt: Date.now() + SOLANA_NONCE_TTL_MS });
  return { nonce, message, expires_at: expiresAt };
}

function consumeSolanaNonce({ nonce, message }) {
  cleanupSolanaNonces();
  const entry = solanaNonces.get(nonce);
  if (!entry || entry.expiresAt <= Date.now()) return false;
  if (String(entry.message) !== String(message || "")) return false;
  solanaNonces.delete(nonce);
  return true;
}

router.get("/solana/nonce", authLimiter, (req, res) => {
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString();
  const domain = host ? host.split(",")[0].trim() : "clickr.cc";
  return res.json(issueSolanaNonce({ domain }));
});

router.post("/solana/verify", authLimiter, async (req, res, next) => {
  const walletAddress = typeof req.body?.wallet_address === "string" ? req.body.wallet_address.trim() : "";
  const messageStr = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const signatureB64 = typeof req.body?.signature === "string" ? req.body.signature.trim() : "";
  const nonce = typeof req.body?.nonce === "string" ? req.body.nonce.trim() : "";
  if (!walletAddress) return res.status(400).json({ error: "wallet_address is required" });
  if (!messageStr) return res.status(400).json({ error: "message is required" });
  if (!signatureB64) return res.status(400).json({ error: "signature is required" });
  if (!nonce) return res.status(400).json({ error: "nonce is required" });

  try {
    const { PublicKey } = require("@solana/web3.js");
    const crypto = require("crypto");
    // nonce lifecycle
    if (!consumeSolanaNonce({ nonce, message: messageStr })) {
      return res.status(400).json({ error: "Nonce missing or expired. Request a new nonce and retry." });
    }
    // signature verify (ed25519)
    const msgBytes = Buffer.from(messageStr, "utf8");
    const sigBytes = Buffer.from(signatureB64, "base64");
    if (sigBytes.length !== 64) return res.status(400).json({ error: "signature looks invalid" });
    const pubkeyBytes = Buffer.from(new PublicKey(walletAddress).toBytes());
    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const keyDer = Buffer.concat([spkiPrefix, pubkeyBytes]);
    const keyObject = crypto.createPublicKey({ key: keyDer, format: "der", type: "spki" });
    const ok = crypto.verify(null, msgBytes, keyObject, sigBytes);
    if (!ok) return res.status(401).json({ error: "Signature did not verify for this wallet" });

    // Solana chain id placeholder (Clickr uses clickr_linked_wallets.chain_id int)
    const SOLANA_CHAIN_ID = 0;
    const user = await findOrCreateUserByWallet(walletAddress, SOLANA_CHAIN_ID);
    if (!user) return res.status(500).json({ error: "Failed to resolve user" });

    const session = await createSession(user.id);
    return res.json({ ok: true, user, wallet_address: walletAddress, ...session });
  } catch (err) {
    next(err);
  }
});

router.post("/wallet", authLimiter, async (req, res, next) => {
  const messageStr = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const signature = typeof req.body?.signature === "string" ? req.body.signature.trim() : "";
  if (!messageStr) return res.status(400).json({ error: "message is required" });
  if (!signature) return res.status(400).json({ error: "signature is required" });

  try {
    const result = await verifySiweMessage(messageStr, signature);
    if (!result.ok) {
      return res.status(401).json({ error: result.error });
    }

    const user = await findOrCreateUserByWallet(result.wallet, result.chainId);
    if (!user) return res.status(500).json({ error: "Failed to resolve user" });

    const session = await createSession(user.id);
    return res.json({
      user,
      wallet_address: result.wallet,
      ...session,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

router.post("/logout", async (req, res, next) => {
  try {
    const resolved = await resolveConnectSession(req);
    if (resolved) {
      const { hashToken } = require("../connect/session");
      await pool.query(`DELETE FROM clickr_sessions WHERE token_hash = $1`, [hashToken(resolved.rawToken)]);
    }
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /auth/claim — redeem a claim token to link an agent
// ---------------------------------------------------------------------------

router.post("/claim", needSession, async (req, res, next) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!token) return res.status(400).json({ error: "token is required" });

  try {
    const result = await redeemClaimToken(token, req.clickrUser.id);
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    return res.json({ ok: true, agent: result.agent });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /auth/me — current user + their agents
// ---------------------------------------------------------------------------

router.get("/me", needSession, async (req, res, next) => {
  try {
    const agents = await pool.query(
      `SELECT id, name, domain, description, avatar_url, metadata, created_at
       FROM agents WHERE owner_id = $1 ORDER BY created_at ASC`,
      [req.clickrUser.id]
    );
    const wallets = await pool.query(
      `SELECT id, address, chain_id, wallet_type, verified_at, label, created_at
       FROM clickr_linked_wallets WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.clickrUser.id]
    );
    return res.json({
      user: req.clickrUser,
      agents: agents.rows,
      wallets: wallets.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Agent management under session
// ---------------------------------------------------------------------------

router.get("/me/agents", needSession, async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT id, name, domain, description, avatar_url, metadata, created_at
       FROM agents WHERE owner_id = $1 ORDER BY created_at ASC`,
      [req.clickrUser.id]
    );
    return res.json({ agents: r.rows });
  } catch (err) {
    next(err);
  }
});

router.get("/me/agents/:agentId", needSession, async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT id, name, domain, personality, description, avatar_url, perspective, skills, goals, tasks, metadata, api_key, created_at
       FROM agents WHERE id = $1 AND owner_id = $2`,
      [req.params.agentId, req.clickrUser.id]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Agent not found or not owned by you" });
    }
    return res.json({ agent: r.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post("/me/agents", needSession, async (req, res, next) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const domain = typeof req.body?.domain === "string" ? req.body.domain.trim() : null;
  const personality = typeof req.body?.personality === "string" ? req.body.personality.trim() : null;
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : null;

  if (!name) return res.status(400).json({ error: "name is required" });

  try {
    const r = await pool.query(
      `INSERT INTO agents (name, domain, personality, description, owner_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, domain, personality, avatar_url, description, metadata, api_key, created_at`,
      [name, domain, personality, description, req.clickrUser.id]
    );
    const agent = r.rows[0];
    setImmediate(() => {
      onboardingRewardPayout
        .markProfileCompleted(agent.id, { ownerUserId: req.clickrUser.id })
        .catch((e) => console.warn("[onboarding-reward]", e.message));
    });
    return res.status(201).json({ ok: true, agent });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Agent name already taken" });
    next(err);
  }
});

/**
 * Link an existing agent to the signed-in user (via API key).
 */
router.post("/me/agents/link", needSession, async (req, res, next) => {
  const agentApiKey = typeof req.body?.api_key === "string" ? req.body.api_key.trim() : "";
  if (!agentApiKey) return res.status(400).json({ error: "api_key is required" });

  try {
    const ar = await pool.query("SELECT id, owner_id FROM agents WHERE api_key = $1", [agentApiKey]);
    if (ar.rows.length === 0) return res.status(404).json({ error: "Invalid agent API key" });
    const agent = ar.rows[0];
    if (agent.owner_id && agent.owner_id !== req.clickrUser.id) {
      return res.status(409).json({ error: "Agent is already linked to another user" });
    }
    await pool.query("UPDATE agents SET owner_id = $1 WHERE id = $2", [req.clickrUser.id, agent.id]);
    return res.json({ ok: true, agent_id: agent.id });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Generate a claim token for an owned agent (for sharing / transfer)
// ---------------------------------------------------------------------------

router.post("/me/agents/:agentId/claim-token", needSession, async (req, res, next) => {
  const agentId = req.params.agentId;
  try {
    const ownership = await pool.query(
      `SELECT id FROM agents WHERE id = $1 AND owner_id = $2`,
      [agentId, req.clickrUser.id]
    );
    if (ownership.rows.length === 0) {
      return res.status(403).json({ error: "Agent not found or not owned by you" });
    }
    const claim = await generateClaimToken(agentId);
    return res.json(claim);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Agent wallet management
// ---------------------------------------------------------------------------

router.get("/me/agents/:agentId/wallets", needSession, async (req, res, next) => {
  try {
    const agentId = req.params.agentId;
    const ownership = await pool.query(
      `SELECT id FROM agents WHERE id = $1 AND owner_id = $2`,
      [agentId, req.clickrUser.id]
    );
    if (ownership.rows.length === 0) {
      return res.status(403).json({ error: "Agent not found or not owned by you" });
    }
    const r = await pool.query(
      `SELECT id, wallet_address, chain_id, chain_type, custody_type, label, linked_at
       FROM agent_wallets WHERE agent_id = $1 ORDER BY linked_at DESC`,
      [agentId]
    );
    return res.json({ wallets: r.rows });
  } catch (err) {
    next(err);
  }
});

router.post("/me/agents/:agentId/wallets", needSession, async (req, res, next) => {
  const agentId = req.params.agentId;
  const chainType = req.body?.chain_type || "evm";
  const custodyType = req.body?.custody_type || "linked";
  const label = typeof req.body?.label === "string" ? req.body.label.slice(0, 200) : null;

  try {
    const ownership = await pool.query(
      `SELECT id FROM agents WHERE id = $1 AND owner_id = $2`,
      [agentId, req.clickrUser.id]
    );
    if (ownership.rows.length === 0) {
      return res.status(403).json({ error: "Agent not found or not owned by you" });
    }

    if (chainType === "solana" && custodyType === "privy") {
      const privyWalletAdapter = require("../integrations/providers/privy-wallet");
      const result = await privyWalletAdapter.connect(agentId, {
        action: "generate",
        label,
        _authMethod: "session",
      });
      return res.status(201).json(result);
    }

    if (chainType === "solana") {
      const { PublicKey } = require("@solana/web3.js");
      const addr = typeof req.body?.wallet_address === "string" ? req.body.wallet_address.trim() : "";
      if (!addr) return res.status(400).json({ error: "wallet_address is required" });
      try {
        new PublicKey(addr);
      } catch {
        return res.status(400).json({ error: "Invalid Solana address" });
      }
      const r = await pool.query(
        `INSERT INTO agent_wallets (agent_id, wallet_address, chain_id, chain_type, custody_type, label)
         VALUES ($1, $2, 0, 'solana', $3, $4)
         ON CONFLICT (wallet_address, chain_type, chain_id)
           DO UPDATE SET label = COALESCE(EXCLUDED.label, agent_wallets.label)
         RETURNING id, wallet_address, chain_id, chain_type, custody_type, label, linked_at`,
        [agentId, addr, custodyType, label]
      );
      return res.status(201).json({ wallet: r.rows[0] });
    }

    // Default: EVM wallet
    const walletAddress = normalizeWallet(req.body?.wallet_address);
    const chainId = Number(req.body?.chain_id) || 8453;
    if (!walletAddress) return res.status(400).json({ error: "wallet_address is required" });

    const addrDb = addressForDb(walletAddress);
    const r = await pool.query(
      `INSERT INTO agent_wallets (agent_id, wallet_address, chain_id, chain_type, custody_type, label)
       VALUES ($1, $2, $3, 'evm', 'linked', $4)
       ON CONFLICT (wallet_address, chain_type, chain_id)
         DO UPDATE SET label = COALESCE(EXCLUDED.label, agent_wallets.label)
       RETURNING id, wallet_address, chain_id, chain_type, custody_type, label, linked_at`,
      [agentId, addrDb, chainId, label]
    );
    return res.status(201).json({ wallet: r.rows[0] });
  } catch (err) {
    if (err.code === "PRIVY_NOT_CONFIGURED") {
      return res.status(503).json({ error: err.message });
    }
    next(err);
  }
});

router.delete("/me/agents/:agentId/wallets/:address", needSession, async (req, res, next) => {
  const agentId = req.params.agentId;
  const rawAddress = typeof req.params.address === "string" ? req.params.address.trim() : "";
  if (!rawAddress) return res.status(400).json({ error: "Invalid wallet address" });

  try {
    const ownership = await pool.query(
      `SELECT id FROM agents WHERE id = $1 AND owner_id = $2`,
      [agentId, req.clickrUser.id]
    );
    if (ownership.rows.length === 0) {
      return res.status(403).json({ error: "Agent not found or not owned by you" });
    }

    // Try Solana address first, then EVM
    let r = await pool.query(
      `DELETE FROM agent_wallets WHERE agent_id = $1 AND wallet_address = $2 RETURNING id, custody_type`,
      [agentId, rawAddress]
    );
    if (r.rows.length === 0) {
      const evmAddr = addressForDb(normalizeWallet(rawAddress));
      if (evmAddr) {
        r = await pool.query(
          `DELETE FROM agent_wallets WHERE agent_id = $1 AND LOWER(wallet_address) = $2 RETURNING id, custody_type`,
          [agentId, evmAddr]
        );
      }
    }
    if (r.rows.length === 0) return res.status(404).json({ error: "Wallet not found on this agent" });
    return res.json({ ok: true, custody_type: r.rows[0].custody_type });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
