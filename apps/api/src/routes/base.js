const { Router } = require("express");
const crypto = require("crypto");
const { ethers } = require("ethers");
const { SiweMessage } = require("siwe");
const { pool } = require("../db");
const erc8004Adapter = require("../integrations/providers/erc8004");

const router = Router();

const SIWE_NONCE_TTL_MS = Number(
  process.env.BASE_AUTH_SIWE_NONCE_TTL_MS || process.env.BASE_AUTH_CHALLENGE_TTL_MS || 5 * 60 * 1000
);
const VERIFIED_TTL_MS = Number(process.env.BASE_AUTH_VERIFIED_TTL_MS || 10 * 60 * 1000);

/** nonce string -> { expiresAt } — one-time use after successful SIWE verify */
const siweNonces = new Map();
const verifiedProofs = new Map();

function now() {
  return Date.now();
}

function normalizeWallet(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return ethers.getAddress(value.trim());
  } catch {
    return null;
  }
}

function parseMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function withBaseMetadata(existing, patch) {
  const metadata = parseMetadata(existing);
  return {
    ...metadata,
    ...patch,
    integrations:
      metadata.integrations && typeof metadata.integrations === "object" ? metadata.integrations : metadata.integrations,
  };
}

function cleanupStores() {
  const ts = now();
  for (const [nonce, item] of siweNonces.entries()) {
    if (item.expiresAt <= ts) siweNonces.delete(nonce);
  }
  for (const [token, item] of verifiedProofs.entries()) {
    if (item.expiresAt <= ts) verifiedProofs.delete(token);
  }
}

function getAllowedSiweDomains() {
  const raw = process.env.SIWE_ALLOWED_DOMAINS || process.env.SIWE_DOMAIN;
  if (raw && String(raw).trim()) {
    return String(raw)
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return ["localhost:3000", "127.0.0.1:3000"];
}

function expectedSiweChainId() {
  return Number(process.env.BASE_CHAIN_ID || process.env.ERC8004_CHAIN_ID || 8453);
}

function verifyProofToken(wallet, proofToken) {
  if (!proofToken || typeof proofToken !== "string") return false;
  const item = verifiedProofs.get(proofToken);
  if (!item) return false;
  if (item.expiresAt <= now()) {
    verifiedProofs.delete(proofToken);
    return false;
  }
  return item.wallet === wallet;
}

async function findAgentByWallet(wallet) {
  const r = await pool.query(
    `SELECT id, name, domain, personality, avatar_url, description, metadata, created_at
     FROM agents
     WHERE LOWER(metadata->>'wallet_owner_address') = LOWER($1)
     ORDER BY created_at ASC
     LIMIT 1`,
    [wallet]
  );
  return r.rows[0] || null;
}

async function findAgentBySlug(slug) {
  const r = await pool.query(
    `SELECT id, name, domain, personality, avatar_url, description, metadata, created_at
     FROM agents
     WHERE LOWER(name) = LOWER($1)
     LIMIT 1`,
    [slug]
  );
  return r.rows[0] || null;
}

router.get("/auth/siwe/nonce", (req, res) => {
  cleanupStores();
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = now() + SIWE_NONCE_TTL_MS;
  siweNonces.set(nonce, { expiresAt });
  return res.json({ nonce, expires_at: new Date(expiresAt).toISOString() });
});

router.post("/auth/siwe/verify", async (req, res) => {
  cleanupStores();
  const messageStr = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const signature = typeof req.body?.signature === "string" ? req.body.signature.trim() : "";
  if (!messageStr) {
    return res.status(400).json({ error: "message is required (full EIP-4361 SIWE string that was signed)" });
  }
  if (!signature) return res.status(400).json({ error: "signature is required" });

  let siweMessage;
  try {
    siweMessage = new SiweMessage(messageStr);
  } catch {
    return res.status(400).json({ error: "Invalid SIWE message" });
  }

  const allowedDomains = getAllowedSiweDomains();
  const msgDomain = String(siweMessage.domain || "").toLowerCase();
  if (!allowedDomains.includes(msgDomain)) {
    return res.status(400).json({ error: "SIWE domain is not allowed for this deployment" });
  }

  const wantChain = expectedSiweChainId();
  if (Number(siweMessage.chainId) !== wantChain) {
    return res.status(400).json({ error: `SIWE chainId must be ${wantChain} (Base)` });
  }

  const nonceEntry = siweNonces.get(siweMessage.nonce);
  if (!nonceEntry || nonceEntry.expiresAt <= now()) {
    return res.status(400).json({ error: "Nonce missing or expired. Request a new nonce." });
  }

  try {
    const result = await siweMessage.verify({
      signature,
      domain: siweMessage.domain,
      nonce: siweMessage.nonce,
    });
    if (!result.success) {
      const msg = result.error?.type || result.error?.message || "SIWE verification failed";
      return res.status(401).json({ error: String(msg) });
    }
  } catch (err) {
    return res.status(401).json({ error: err.message || "SIWE verification failed" });
  }

  siweNonces.delete(siweMessage.nonce);

  const wallet = normalizeWallet(siweMessage.address);
  if (!wallet) return res.status(400).json({ error: "Invalid address in SIWE message" });

  const proofToken = crypto.randomBytes(24).toString("hex");
  const expiresAt = now() + VERIFIED_TTL_MS;
  verifiedProofs.set(proofToken, { wallet, expiresAt });

  return res.json({
    ok: true,
    wallet_address: wallet,
    proof_token: proofToken,
    expires_at: new Date(expiresAt).toISOString(),
  });
});

router.get("/agents/me", async (req, res, next) => {
  try {
    const wallet = normalizeWallet(req.query.wallet);
    if (!wallet) return res.status(400).json({ error: "wallet query param is required and must be valid" });
    const agent = await findAgentByWallet(wallet);
    if (!agent) return res.json({ found: false });
    return res.json({ found: true, agent });
  } catch (err) {
    next(err);
  }
});

router.get("/agents/slug/:slug", async (req, res, next) => {
  try {
    const agent = await findAgentBySlug(req.params.slug);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    return res.json({ agent });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/create", async (req, res, next) => {
  const wallet = normalizeWallet(req.body?.wallet_address);
  const proofToken = typeof req.body?.proof_token === "string" ? req.body.proof_token.trim() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const domain = typeof req.body?.domain === "string" ? req.body.domain.trim() : null;
  const personality = typeof req.body?.personality === "string" ? req.body.personality.trim() : null;
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : null;

  if (!wallet) return res.status(400).json({ error: "wallet_address is required and must be valid" });
  if (!verifyProofToken(wallet, proofToken)) return res.status(401).json({ error: "Invalid or expired proof_token" });
  if (!name) return res.status(400).json({ error: "name is required" });

  try {
    const existing = await findAgentByWallet(wallet);
    if (existing) {
      return res.status(409).json({ error: "This wallet already has a linked agent", agent: existing });
    }
    const metadata = {
      wallet_owner_address: wallet,
      base_profile_slug: name.toLowerCase(),
      base_app_installed_at: new Date().toISOString(),
    };
    const result = await pool.query(
      `INSERT INTO agents (name, domain, personality, description, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, domain, personality, avatar_url, description, metadata, api_key, created_at`,
      [name, domain, personality, description, JSON.stringify(metadata)]
    );
    return res.status(201).json({ ok: true, agent: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Agent name already taken" });
    next(err);
  }
});

router.post("/agents/claim", async (req, res, next) => {
  const wallet = normalizeWallet(req.body?.wallet_address);
  const proofToken = typeof req.body?.proof_token === "string" ? req.body.proof_token.trim() : "";
  const agentApiKey = typeof req.body?.agent_api_key === "string" ? req.body.agent_api_key.trim() : "";

  if (!wallet) return res.status(400).json({ error: "wallet_address is required and must be valid" });
  if (!verifyProofToken(wallet, proofToken)) return res.status(401).json({ error: "Invalid or expired proof_token" });
  if (!agentApiKey) return res.status(400).json({ error: "agent_api_key is required to claim existing agent" });

  try {
    const r = await pool.query(
      `SELECT id, name, metadata
       FROM agents
       WHERE api_key = $1
       LIMIT 1`,
      [agentApiKey]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Agent not found for provided API key" });
    const agent = r.rows[0];
    const metadata = parseMetadata(agent.metadata);
    const currentOwner = normalizeWallet(metadata.wallet_owner_address);
    if (currentOwner && currentOwner !== wallet) {
      return res.status(409).json({ error: "Agent is already claimed by another wallet" });
    }
    const nextMetadata = withBaseMetadata(metadata, {
      wallet_owner_address: wallet,
      base_profile_slug: agent.name.toLowerCase(),
      base_app_installed_at: metadata.base_app_installed_at || new Date().toISOString(),
    });
    const up = await pool.query(
      `UPDATE agents
       SET metadata = $1
       WHERE id = $2
       RETURNING id, name, domain, personality, avatar_url, description, metadata, created_at`,
      [JSON.stringify(nextMetadata), agent.id]
    );
    return res.json({ ok: true, agent: up.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post("/agents/:id/mint-identity", async (req, res, next) => {
  const wallet = normalizeWallet(req.body?.wallet_address);
  const proofToken = typeof req.body?.proof_token === "string" ? req.body.proof_token.trim() : "";
  const agentId = req.params.id;

  if (!wallet) return res.status(400).json({ error: "wallet_address is required and must be valid" });
  if (!verifyProofToken(wallet, proofToken)) return res.status(401).json({ error: "Invalid or expired proof_token" });

  try {
    const r = await pool.query(`SELECT id, metadata FROM agents WHERE id = $1 LIMIT 1`, [agentId]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Agent not found" });
    const metadata = parseMetadata(r.rows[0].metadata);
    const owner = normalizeWallet(metadata.wallet_owner_address);
    if (!owner || owner !== wallet) {
      return res.status(403).json({ error: "Wallet does not control this agent" });
    }
    const minted = await erc8004Adapter.connect(agentId, { owner_wallet: wallet });
    return res.json(minted);
  } catch (err) {
    const mapped = erc8004Adapter.mapConnectError?.(err);
    if (mapped) return res.status(mapped.status || 400).json({ error: mapped.error || "Mint failed" });
    next(err);
  }
});

router.post("/agents/:id/verify-identity", async (req, res, next) => {
  try {
    const out = await erc8004Adapter.verify(req.params.id);
    return res.json(out);
  } catch (err) {
    if (err.code === "ERC8004_NOT_MINTED") return res.status(400).json({ error: err.message });
    if (err.code === "ERC8004_NOT_CONFIGURED") return res.status(503).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
