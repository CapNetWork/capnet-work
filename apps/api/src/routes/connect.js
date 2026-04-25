/**
 * Clickr Connect — user/session/OAuth/grants (Phase 1).
 * Mounted at /connect (always registered in apps/api/src/index.js; use env + secrets to gate usage).
 * Does not replace agent Bearer auth on existing routes.
 */
const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const { listConnectProviders } = require("../connect/providers-catalog");
const { requireConnectSession, createUserAndSession } = require("../connect/session");
const { issueNonce, verifySiweWalletLink, normalizeWallet, addressForDb } = require("../connect/siwe-link");

const router = Router();

const needSession = requireConnectSession();

const bootstrapLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: "Too many bootstrap requests from this IP" },
  standardHeaders: true,
  legacyHeaders: false,
});

const SCHEMA_TABLES = [
  "clickr_users",
  "clickr_sessions",
  "clickr_user_provider_connections",
  "clickr_permission_grants",
  "clickr_audit_events",
  "clickr_linked_wallets",
];

router.get("/status", (_req, res) => {
  res.json({
    service: "clickr-connect",
    phase: "mvp_partial",
    schema: SCHEMA_TABLES,
    auth: {
      bootstrap: "POST /connect/bootstrap/user + CLICKR_CONNECT_BOOTSTRAP_SECRET",
      session: "X-Clickr-Connect-Session or Authorization: Connect-Session <token>",
      wallet_verify: "GET /connect/auth/siwe/nonce then POST /connect/me/wallets/verify",
    },
    note: "Gmail OAuth and grant CRUD for provider tokens are not implemented yet.",
  });
});

router.get("/providers", (_req, res) => {
  res.json({ providers: listConnectProviders() });
});

/**
 * Dev / controlled onboarding: creates clickr_users + session.
 * Requires Authorization: Bearer <CLICKR_CONNECT_BOOTSTRAP_SECRET>.
 */
router.post("/bootstrap/user", bootstrapLimiter, async (req, res, next) => {
  const secret = process.env.CLICKR_CONNECT_BOOTSTRAP_SECRET;
  if (!secret || !String(secret).trim()) {
    return res.status(503).json({
      error: "CLICKR_CONNECT_BOOTSTRAP_SECRET is not set",
      hint: "Set a long random secret in .env for controlled user creation (not for public production signup).",
    });
  }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization: Bearer <CLICKR_CONNECT_BOOTSTRAP_SECRET> required" });
  }
  if (auth.slice(7) !== secret) {
    return res.status(403).json({ error: "Invalid bootstrap secret" });
  }
  const email = typeof req.body?.email === "string" ? req.body.email.trim() || null : null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await createUserAndSession(client, { email });
    await client.query("COMMIT");
    return res.status(201).json(out);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      return res.status(409).json({ error: "Email already registered" });
    }
    return next(err);
  } finally {
    client.release();
  }
});

/** SIWE nonce for wallet linking (separate from /base nonces). */
router.get("/auth/siwe/nonce", (_req, res) => {
  res.json(issueNonce());
});

router.get("/me", needSession, (req, res) => {
  res.json({ user: req.clickrUser });
});

router.get("/me/wallets", needSession, async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT id, address, chain_id, wallet_type, verified_at, label, created_at
       FROM clickr_linked_wallets WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.clickrUser.id]
    );
    res.json({ wallets: r.rows });
  } catch (err) {
    next(err);
  }
});

/** Register or update a wallet row (may be unverified until POST .../verify). */
router.post("/me/wallets", needSession, async (req, res, next) => {
  try {
    const address = normalizeWallet(req.body?.address);
    if (!address) {
      return res.status(400).json({ error: "address is required (0x-prefixed EVM address)" });
    }
    const chainId = Number(req.body?.chain_id);
    const cid = Number.isFinite(chainId) && chainId > 0 ? chainId : 8453;
    const label = typeof req.body?.label === "string" ? req.body.label.slice(0, 200) : null;
    const addrDb = addressForDb(address);
    const ins = await pool.query(
      `INSERT INTO clickr_linked_wallets (user_id, address, chain_id, label)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, address, chain_id)
       DO UPDATE SET
         label = COALESCE(EXCLUDED.label, clickr_linked_wallets.label),
         updated_at = now()
       RETURNING id, address, chain_id, wallet_type, verified_at, label, created_at`,
      [req.clickrUser.id, addrDb, cid, label]
    );
    res.status(201).json({ wallet: ins.rows[0] });
  } catch (err) {
    next(err);
  }
});

/** SIWE verify; sets verified_at on the wallet row for this user + chain. */
router.post("/me/wallets/verify", needSession, async (req, res, next) => {
  try {
    const messageStr = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const signature = typeof req.body?.signature === "string" ? req.body.signature.trim() : "";
    if (!messageStr || !signature) {
      return res.status(400).json({ error: "message and signature are required" });
    }
    const v = await verifySiweWalletLink(messageStr, signature);
    if (!v.ok) {
      return res.status(401).json({ error: v.error });
    }
    const addrDb = addressForDb(v.address);
    const ins = await pool.query(
      `INSERT INTO clickr_linked_wallets (user_id, address, chain_id, wallet_type, verified_at, updated_at)
       VALUES ($1, $2, $3, 'unknown', now(), now())
       ON CONFLICT (user_id, address, chain_id)
       DO UPDATE SET verified_at = now(), updated_at = now()
       RETURNING id, address, chain_id, wallet_type, verified_at, label, created_at`,
      [req.clickrUser.id, addrDb, v.chain_id]
    );
    await pool.query(
      `INSERT INTO clickr_audit_events (user_id, action, provider_id, outcome, metadata)
       VALUES ($1, 'wallet.verify', 'wallet_evm', 'ok', $2::jsonb)`,
      [req.clickrUser.id, JSON.stringify({ address: addrDb, chain_id: v.chain_id })]
    );
    res.json({ wallet: ins.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * Link agent to this user (sets agents.owner_id).
 * Headers: X-Clickr-Connect-Session (or Connect-Session) + X-Capnet-Agent-Key: <agent api_key>
 */
router.post("/me/agents/link", needSession, async (req, res, next) => {
  try {
    const agentKey = req.headers["x-capnet-agent-key"];
    if (!agentKey || typeof agentKey !== "string") {
      return res.status(400).json({
        error: "X-Capnet-Agent-Key header required (the agent's capnet_sk_ API key)",
      });
    }
    const ar = await pool.query("SELECT id, owner_id FROM agents WHERE api_key = $1", [agentKey.trim()]);
    if (ar.rows.length === 0) {
      return res.status(401).json({ error: "Invalid agent API key" });
    }
    const agent = ar.rows[0];
    if (agent.owner_id && agent.owner_id !== req.clickrUser.id) {
      return res.status(409).json({ error: "Agent is already linked to another Clickr user" });
    }
    await pool.query("UPDATE agents SET owner_id = $1 WHERE id = $2", [req.clickrUser.id, agent.id]);
    await pool.query(
      `INSERT INTO clickr_audit_events (user_id, actor_agent_id, action, outcome, metadata)
       VALUES ($1, $2, 'agent.link', 'ok', '{}'::jsonb)`,
      [req.clickrUser.id, agent.id]
    );
    res.json({ ok: true, agent_id: agent.id, owner_id: req.clickrUser.id });
  } catch (err) {
    next(err);
  }
});

router.delete("/me/agents/:agentId", needSession, async (req, res, next) => {
  try {
    const agentId = String(req.params.agentId || "").trim();
    const r = await pool.query(
      `UPDATE agents SET owner_id = NULL WHERE id = $1 AND owner_id = $2 RETURNING id`,
      [agentId, req.clickrUser.id]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Agent not found or not linked to you" });
    }
    await pool.query(
      `INSERT INTO clickr_audit_events (user_id, actor_agent_id, action, outcome, metadata)
       VALUES ($1, $2, 'agent.unlink', 'ok', '{}'::jsonb)`,
      [req.clickrUser.id, agentId]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get("/me/grants", needSession, async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT g.id, g.agent_id, g.scopes, g.revoked_at, g.created_at, c.provider_id, c.id AS user_provider_connection_id
       FROM clickr_permission_grants g
       JOIN clickr_user_provider_connections c ON c.id = g.user_provider_connection_id
       WHERE g.user_id = $1 AND g.revoked_at IS NULL
       ORDER BY g.created_at DESC`,
      [req.clickrUser.id]
    );
    res.json({ grants: r.rows });
  } catch (err) {
    next(err);
  }
});

router.get("/me/audit", needSession, async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const r = await pool.query(
      `SELECT id, actor_agent_id, action, provider_id, outcome, metadata, created_at
       FROM clickr_audit_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.clickrUser.id, limit]
    );
    res.json({ events: r.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
