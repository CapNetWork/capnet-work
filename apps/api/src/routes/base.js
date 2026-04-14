const { Router } = require("express");
const { pool } = require("../db");
const erc8004Adapter = require("../integrations/providers/erc8004");
const {
  issueNonce,
  verifySiweMessage,
  issueProofToken,
  verifyProofToken,
  normalizeWallet,
} = require("../lib/siwe-proof-store");

const router = Router();

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

async function findAgentByWallet(wallet) {
  const r = await pool.query(
    `SELECT a.id, a.name, a.domain, a.personality, a.avatar_url, a.description, a.metadata, a.created_at
     FROM agents a
     JOIN agent_wallets aw ON aw.agent_id = a.id
     WHERE LOWER(aw.wallet_address) = LOWER($1)
     ORDER BY a.created_at ASC
     LIMIT 1`,
    [wallet]
  );
  if (r.rows.length > 0) return r.rows[0];
  // Fallback: check legacy metadata field for agents not yet migrated
  const legacy = await pool.query(
    `SELECT id, name, domain, personality, avatar_url, description, metadata, created_at
     FROM agents
     WHERE LOWER(metadata->>'wallet_owner_address') = LOWER($1)
     ORDER BY created_at ASC
     LIMIT 1`,
    [wallet]
  );
  return legacy.rows[0] || null;
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

async function linkWalletToAgent(agentId, wallet, label) {
  const addrDb = wallet.toLowerCase();
  await pool.query(
    `INSERT INTO agent_wallets (agent_id, wallet_address, chain_id, label)
     VALUES ($1, $2, 8453, $3)
     ON CONFLICT (wallet_address, chain_id) DO NOTHING`,
    [agentId, addrDb, label || null]
  );
}

router.get("/auth/siwe/nonce", (_req, res) => {
  return res.json(issueNonce());
});

router.post("/auth/siwe/verify", async (req, res) => {
  const messageStr = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const signature = typeof req.body?.signature === "string" ? req.body.signature.trim() : "";
  if (!messageStr) {
    return res.status(400).json({ error: "message is required (full EIP-4361 SIWE string that was signed)" });
  }
  if (!signature) return res.status(400).json({ error: "signature is required" });

  const result = await verifySiweMessage(messageStr, signature);
  if (!result.ok) {
    return res.status(401).json({ error: result.error });
  }

  const proof = issueProofToken(result.wallet);
  return res.json({
    ok: true,
    wallet_address: result.wallet,
    proof_token: proof.proof_token,
    expires_at: proof.expires_at,
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
    const agent = result.rows[0];
    await linkWalletToAgent(agent.id, wallet, "base-create");
    return res.status(201).json({ ok: true, agent });
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
    await linkWalletToAgent(agent.id, wallet, "base-claim");
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
    // Check ownership via agent_wallets table (with legacy metadata fallback)
    const r = await pool.query(
      `SELECT a.id, a.metadata FROM agents a
       WHERE a.id = $1
         AND (
           EXISTS (SELECT 1 FROM agent_wallets aw WHERE aw.agent_id = a.id AND LOWER(aw.wallet_address) = LOWER($2))
           OR LOWER(a.metadata->>'wallet_owner_address') = LOWER($2)
         )
       LIMIT 1`,
      [agentId, wallet]
    );
    if (r.rows.length === 0) {
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
