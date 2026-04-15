const { Router } = require("express");
const { authenticateBySessionOrKey } = require("../middleware/auth");
const { sanitizeBody } = require("../middleware/sanitize");
const { listProviders, getProvider } = require("../integrations/registry");
const {
  pick,
  getAgentMetadata,
  getProviderConfig,
  upsertProviderConfig,
  deleteProviderConfig,
} = require("../integrations/store");
const bankrAdapter = require("../integrations/providers/bankr");
const agentmailAdapter = require("../integrations/providers/agentmail");
const erc8004Adapter = require("../integrations/providers/erc8004");
const privyWalletAdapter = require("../integrations/providers/privy-wallet");
const worldIdAdapter = require("../integrations/providers/world-id");
const x402Adapter = require("../integrations/providers/x402");
const rateLimit = require("express-rate-limit");

/** Providers with custom persistence (DB, external APIs). Keys must match registry ids. */
const ADAPTERS = {
  bankr: bankrAdapter,
  agentmail: agentmailAdapter,
  erc8004: erc8004Adapter,
  privy_wallet: privyWalletAdapter,
  world_id: worldIdAdapter,
  x402: x402Adapter,
};

const walletSignLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.agent?.id || "unknown",
  message: { error: "Rate limit exceeded for wallet signing (10/min)" },
  standardHeaders: true,
  legacyHeaders: false,
});

const walletSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.agent?.id || "unknown",
  message: { error: "Rate limit exceeded for wallet send (5/min)" },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

function sanitizeConfigInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    // Keep metadata JSON-safe and avoid unbounded keys.
    if (typeof key !== "string" || key.length > 100) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

function toProviderErrorResponse(providerId, err) {
  const adapter = ADAPTERS[providerId];
  if (typeof adapter?.mapConnectError === "function") {
    const mapped = adapter.mapConnectError(err);
    if (mapped && typeof mapped === "object") {
      return mapped;
    }
  }
  return null;
}

router.get("/providers", authenticateBySessionOrKey, async (_req, res) => {
  const providers = listProviders().map((provider) => ({
    id: provider.id,
    display_name: provider.display_name,
    category: provider.category,
    supports: provider.supports,
  }));
  res.json({ providers });
});

router.post("/:providerId/connect", authenticateBySessionOrKey, sanitizeBody([]), async (req, res, next) => {
  const provider = getProvider(req.params.providerId);
  if (!provider) return res.status(404).json({ error: "Unsupported provider" });

  const adapter = ADAPTERS[provider.id];
  if (!adapter?.connect) {
    return res.status(400).json({
      error: "This provider does not expose a connect flow. Use PUT /integrations/:providerId/config.",
    });
  }

  const input = typeof adapter.readConnectInput === "function" ? adapter.readConnectInput(req.body) : req.body;
  try {
    const out = await adapter.connect(req.agent.id, input);
    res.json(out);
  } catch (err) {
    const mapped = toProviderErrorResponse(provider.id, err);
    if (mapped) {
      return res.status(mapped.status || 400).json({ error: mapped.error || "Provider connect failed" });
    }
    next(err);
  }
});

router.post("/agentmail/link", authenticateBySessionOrKey, async (req, res, next) => {
  try {
    const { username, display_name } = req.body || {};
    const body = await agentmailAdapter.link(req.agent.id, { username, display_name });
    res.status(201).json(body);
  } catch (err) {
    if (err.code === "AGENTMAIL_NOT_CONFIGURED") {
      return res.status(503).json({ error: "AgentMail is not configured (AGENTMAIL_API_KEY)" });
    }
    if (err.code === "AGENTMAIL_BAD_RESPONSE") {
      return res.status(400).json({ error: err.message });
    }
    if (typeof err.status === "number" && err.status >= 400) {
      const body = err.body && typeof err.body === "object" ? err.body : {};
      return res.status(502).json({
        error: err.message || "AgentMail request failed",
        upstream_status: err.status,
        upstream_detail: body.errors || body.message || undefined,
      });
    }
    console.error("[integrations/agentmail/link]", err.message, err.stack);
    next(err);
  }
});

router.post("/erc8004/verify", authenticateBySessionOrKey, async (req, res, next) => {
  try {
    const out = await erc8004Adapter.verify(req.agent.id);
    res.json(out);
  } catch (err) {
    if (err.code === "ERC8004_NOT_MINTED") {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === "ERC8004_NOT_CONFIGURED") {
      return res.status(503).json({ error: err.message });
    }
    if (err.code === "ERC8004_INVALID_OWNER") {
      return res.status(422).json({ error: err.message });
    }
    next(err);
  }
});

router.post("/agentmail/send", authenticateBySessionOrKey, sanitizeBody(["to", "subject", "text"]), async (req, res, next) => {
  const { to, subject, text, html } = req.body || {};
  if (!to || typeof to !== "string") {
    return res.status(400).json({ error: "to is required" });
  }
  if (!subject || typeof subject !== "string") {
    return res.status(400).json({ error: "subject is required" });
  }
  if ((text == null || text === "") && (html == null || html === "")) {
    return res.status(400).json({ error: "text or html is required" });
  }
  try {
    const out = await agentmailAdapter.send(req.agent.id, { to, subject, text, html });
    res.json(out);
  } catch (err) {
    if (err.code === "AGENTMAIL_NOT_CONFIGURED") {
      return res.status(503).json({ error: "AgentMail is not configured (AGENTMAIL_API_KEY)" });
    }
    if (err.code === "AGENTMAIL_NOT_LINKED") {
      return res.status(400).json({ error: err.message });
    }
    if (typeof err.status === "number" && err.status >= 400) {
      return res.status(502).json({
        error: err.message || "AgentMail request failed",
        upstream_status: err.status,
      });
    }
    console.error("[integrations/agentmail/send]", err.message, err.stack);
    next(err);
  }
});

router.get("/agentmail/inbox", authenticateBySessionOrKey, async (req, res, next) => {
  try {
    const status = await agentmailAdapter.getIntegrationStatus(req.agent.id);
    if (!status.connected) {
      return res.status(400).json({ error: "AgentMail not linked; POST /integrations/agentmail/link first" });
    }
    const limit = parseInt(req.query.limit, 10);
    const messages = await agentmailAdapter.listInbound(req.agent.id, limit);
    res.json({ provider: "agentmail", messages });
  } catch (err) {
    if (err.code === "42P01") {
      return res.status(503).json({
        error: "Inbound table missing; run npm run db:migrate (includes 004_agentmail_inbound_events.sql)",
      });
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Privy Wallet custom routes
// ---------------------------------------------------------------------------

async function requirePrivyWallet(req, res) {
  const { pool: db } = require("../db");
  const r = await db.query(
    `SELECT id, wallet_address, chain_type, custody_type, provider_wallet_id, provider_policy_id
     FROM agent_wallets
     WHERE agent_id = $1 AND chain_type = 'solana' AND custody_type = 'privy'
     ORDER BY linked_at DESC LIMIT 1`,
    [req.agent.id]
  );
  if (r.rows.length === 0) {
    res.status(400).json({ error: "No Privy wallet linked. POST /integrations/privy_wallet/connect first." });
    return null;
  }
  return r.rows[0];
}

router.post("/privy_wallet/sign", authenticateBySessionOrKey, walletSignLimiter, async (req, res, next) => {
  const walletRow = await requirePrivyWallet(req, res);
  if (!walletRow) return;
  try {
    const authMethod = req.clickrUser ? "session" : "api_key";
    const result = await privyWalletAdapter.sign(req.agent.id, walletRow, req.body || {}, authMethod);
    res.json(result);
  } catch (err) {
    const mapped = privyWalletAdapter.mapConnectError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    next(err);
  }
});

router.post("/privy_wallet/send", authenticateBySessionOrKey, walletSendLimiter, async (req, res, next) => {
  const walletRow = await requirePrivyWallet(req, res);
  if (!walletRow) return;
  try {
    const authMethod = req.clickrUser ? "session" : "api_key";
    const result = await privyWalletAdapter.send(req.agent.id, walletRow, req.body || {}, authMethod);
    res.json(result);
  } catch (err) {
    const mapped = privyWalletAdapter.mapConnectError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    next(err);
  }
});

router.get("/privy_wallet/balance", authenticateBySessionOrKey, async (req, res, next) => {
  const walletRow = await requirePrivyWallet(req, res);
  if (!walletRow) return;
  try {
    const privyDriver = require("../lib/drivers/privy");
    const balance = await privyDriver.getBalance(walletRow.wallet_address);
    res.json({ wallet_address: walletRow.wallet_address, ...balance });
  } catch (err) {
    next(err);
  }
});

router.get("/privy_wallet/policy", authenticateBySessionOrKey, async (req, res, next) => {
  const walletRow = await requirePrivyWallet(req, res);
  if (!walletRow) return;
  try {
    const privyDriver = require("../lib/drivers/privy");
    const policy = await privyDriver.getPolicy(walletRow);
    res.json({ wallet_address: walletRow.wallet_address, policy });
  } catch (err) {
    next(err);
  }
});

router.get("/privy_wallet/transactions", authenticateBySessionOrKey, async (req, res, next) => {
  try {
    const walletAudit = require("../lib/wallet-audit");
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = parseInt(req.query.offset, 10) || 0;
    const history = await walletAudit.getHistory(req.agent.id, { limit, offset });
    res.json({ transactions: history });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// World ID custom routes
// ---------------------------------------------------------------------------

router.post("/world_id/verify", authenticateBySessionOrKey, async (req, res, next) => {
  try {
    const input = worldIdAdapter.readConnectInput(req.body);
    const result = await worldIdAdapter.connect(req.agent.id, input);
    res.json(result);
  } catch (err) {
    const mapped = worldIdAdapter.mapConnectError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    next(err);
  }
});

router.get("/world_id/status", authenticateBySessionOrKey, async (req, res, next) => {
  try {
    const status = await worldIdAdapter.getIntegrationStatus(req.agent.id);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// x402 Payments custom routes
// ---------------------------------------------------------------------------

router.get("/x402/ledger", authenticateBySessionOrKey, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const ledger = await x402Adapter.getLedger(req.agent.id, { limit, offset });
    res.json({ payments: ledger });
  } catch (err) {
    next(err);
  }
});

router.get("/x402/stats", authenticateBySessionOrKey, async (req, res, next) => {
  try {
    const stats = await x402Adapter.getPaymentStats(req.agent.id);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Generic integration list / status / config routes
// ---------------------------------------------------------------------------

router.get("/", authenticateBySessionOrKey, async (req, res, next) => {
  try {
    const metadata = await getAgentMetadata(req.agent.id);
    const integrations = metadata.integrations && typeof metadata.integrations === "object" ? metadata.integrations : {};
    const providers = await Promise.all(
      listProviders().map(async (provider) => {
        const adapter = ADAPTERS[provider.id];
        if (adapter?.getIntegrationStatus) {
          const s = await adapter.getIntegrationStatus(req.agent.id);
          return {
            id: provider.id,
            display_name: provider.display_name,
            category: provider.category,
            supports: provider.supports,
            enabled: s.connected,
            config: s.connected ? s.config : null,
          };
        }
        const cfg = integrations[provider.id] || null;
        return {
          id: provider.id,
          display_name: provider.display_name,
          category: provider.category,
          supports: provider.supports,
          enabled: Boolean(cfg),
          config: cfg ? pick(cfg, provider.public_fields) : null,
        };
      })
    );
    res.json({ providers });
  } catch (err) {
    next(err);
  }
});

router.get("/:providerId/status", authenticateBySessionOrKey, async (req, res, next) => {
  const provider = getProvider(req.params.providerId);
  if (!provider) return res.status(404).json({ error: "Unsupported provider" });

  try {
    const adapter = ADAPTERS[provider.id];
    if (adapter?.getIntegrationStatus) {
      const s = await adapter.getIntegrationStatus(req.agent.id);
      if (!s.connected) {
        return res.json({ connected: false, provider: provider.id });
      }
      return res.json({
        connected: true,
        provider: provider.id,
        config: s.config,
      });
    }
    const config = await getProviderConfig(req.agent.id, provider.id);
    if (!config || Object.keys(config).length === 0) {
      return res.json({ connected: false, provider: provider.id });
    }
    return res.json({
      connected: true,
      provider: provider.id,
      config: pick(config, provider.public_fields),
    });
  } catch (err) {
    next(err);
  }
});

router.put("/:providerId/config", authenticateBySessionOrKey, sanitizeBody([]), async (req, res, next) => {
  const provider = getProvider(req.params.providerId);
  if (!provider) return res.status(404).json({ error: "Unsupported provider" });

  const adapter = ADAPTERS[provider.id];
  if (adapter?.forbidDirectConfigPut?.()) {
    return res.status(400).json({
      error:
        "This provider cannot be linked by editing config here. Use the provider connect flow (e.g. POST /integrations/bankr/connect or POST /integrations/agentmail/link).",
    });
  }

  const config = sanitizeConfigInput(req.body?.config);
  if (!config || Object.keys(config).length === 0) {
    return res.status(400).json({ error: "config object is required" });
  }

  try {
    const saved = await upsertProviderConfig(req.agent.id, provider.id, config);
    res.json({
      ok: true,
      provider: provider.id,
      config: pick(saved, provider.public_fields),
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:providerId/config", authenticateBySessionOrKey, async (req, res, next) => {
  const provider = getProvider(req.params.providerId);
  if (!provider) return res.status(404).json({ error: "Unsupported provider" });
  try {
    const adapter = ADAPTERS[provider.id];
    if (adapter?.disconnect) {
      const out = await adapter.disconnect(req.agent.id);
      return res.json(out);
    }
    const removed = await deleteProviderConfig(req.agent.id, provider.id);
    res.json({ ok: true, provider: provider.id, removed });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
