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
const erc8004Adapter = require("../integrations/providers/erc8004");
const privyWalletAdapter = require("../integrations/providers/privy-wallet");
const solanaMemoAnchor = require("../services/solana-memo-anchor");
const phantomWalletAdapter = require("../integrations/providers/phantom-wallet");
const moonpayAdapter = require("../integrations/providers/moonpay");
const worldIdAdapter = require("../integrations/providers/world-id");
const x402Adapter = require("../integrations/providers/x402");
const rateLimit = require("express-rate-limit");

/** Providers with custom persistence (DB, external APIs). Keys must match registry ids. */
const ADAPTERS = {
  bankr: bankrAdapter,
  erc8004: erc8004Adapter,
  privy_wallet: privyWalletAdapter,
  phantom_wallet: phantomWalletAdapter,
  moonpay: moonpayAdapter,
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

const walletFaucetLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 2,
  keyGenerator: (req) => req.agent?.id || "unknown",
  message: { error: "Rate limit exceeded for devnet faucet (2/10min)" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Per-user limiter for wallet activity. A user with N agents would otherwise
// multiply the per-agent limits; this keeps total wallet ops bounded per human.
const walletUserLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => `user:${req.clickrUser?.id || req.agent?.id || "unknown"}`,
  message: { error: "Rate limit exceeded for wallet activity (30/min per user)" },
  standardHeaders: true,
  legacyHeaders: false,
});

const walletFaucetUserLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `user:${req.clickrUser?.id || req.agent?.id || "unknown"}`,
  message: { error: "Rate limit exceeded for devnet faucet (5/10min per user)" },
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

  const authMethod = req.clickrUser ? "session" : "api_key";
  const baseInput = typeof adapter.readConnectInput === "function" ? adapter.readConnectInput(req.body) : req.body;
  const input = { ...baseInput, _authMethod: authMethod };
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

// ---------------------------------------------------------------------------
// Privy Wallet custom routes
// ---------------------------------------------------------------------------

async function requirePrivyWallet(req, res) {
  const { pool: db } = require("../db");
  const r = await db.query(
    `SELECT id, agent_id, wallet_address, chain_type, custody_type,
            provider_wallet_id, provider_policy_id,
            is_paused, paused_at, paused_reason, policy_json
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

router.post("/privy_wallet/sign", authenticateBySessionOrKey, walletUserLimiter, walletSignLimiter, async (req, res, next) => {
  const walletRow = await requirePrivyWallet(req, res);
  if (!walletRow) return;
  try {
    const authMethod = req.clickrUser ? "session" : "api_key";
    const result = await privyWalletAdapter.sign(req.agent.id, walletRow, req.body || {}, authMethod);
    res.json(result);
  } catch (err) {
    const mapped = privyWalletAdapter.mapConnectError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error, ...(mapped.rule ? { rule: mapped.rule } : {}) });
    next(err);
  }
});

router.post("/privy_wallet/send", authenticateBySessionOrKey, walletUserLimiter, walletSendLimiter, async (req, res, next) => {
  const walletRow = await requirePrivyWallet(req, res);
  if (!walletRow) return;
  try {
    const authMethod = req.clickrUser ? "session" : "api_key";
    const result = await privyWalletAdapter.send(req.agent.id, walletRow, req.body || {}, authMethod);
    res.json(result);
  } catch (err) {
    const mapped = privyWalletAdapter.mapConnectError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error, ...(mapped.rule ? { rule: mapped.rule } : {}) });
    next(err);
  }
});

router.post("/privy_wallet/devnet-memo-test", authenticateBySessionOrKey, walletUserLimiter, walletSendLimiter, async (req, res, next) => {
  const walletRow = await requirePrivyWallet(req, res);
  if (!walletRow) return;
  try {
    const authMethod = req.clickrUser ? "session" : "api_key";
    const result = await solanaMemoAnchor.anchorTestMemo({
      agentId: req.agent.id,
      walletRow,
      walletAddress: walletRow.wallet_address,
      message: req.body?.message,
      authMethod,
    });
    res.json(result);
  } catch (err) {
    const mapped = privyWalletAdapter.mapConnectError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error, ...(mapped.rule ? { rule: mapped.rule } : {}) });
    next(err);
  }
});

router.post("/privy_wallet/pause", authenticateBySessionOrKey, walletUserLimiter, async (req, res, next) => {
  const walletRow = await requirePrivyWallet(req, res);
  if (!walletRow) return;
  try {
    const authMethod = req.clickrUser ? "session" : "api_key";
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : null;
    const updated = await privyWalletAdapter.pause(req.agent.id, walletRow, reason, authMethod);
    res.json({ ok: true, wallet: updated });
  } catch (err) {
    const mapped = privyWalletAdapter.mapConnectError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    next(err);
  }
});

router.post("/privy_wallet/resume", authenticateBySessionOrKey, walletUserLimiter, async (req, res, next) => {
  const walletRow = await requirePrivyWallet(req, res);
  if (!walletRow) return;
  try {
    const authMethod = req.clickrUser ? "session" : "api_key";
    const updated = await privyWalletAdapter.resume(req.agent.id, walletRow, authMethod);
    res.json({ ok: true, wallet: updated });
  } catch (err) {
    const mapped = privyWalletAdapter.mapConnectError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    next(err);
  }
});

router.patch("/privy_wallet/policy", authenticateBySessionOrKey, walletUserLimiter, async (req, res, next) => {
  const walletRow = await requirePrivyWallet(req, res);
  if (!walletRow) return;
  try {
    const updated = await privyWalletAdapter.updatePolicy(req.agent.id, walletRow, req.body || {});
    res.json({ ok: true, wallet: updated });
  } catch (err) {
    const mapped = privyWalletAdapter.mapConnectError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    next(err);
  }
});

router.post("/privy_wallet/devnet-airdrop", authenticateBySessionOrKey, walletFaucetUserLimiter, walletFaucetLimiter, async (req, res, next) => {
  const walletRow = await requirePrivyWallet(req, res);
  if (!walletRow) return;
  try {
    const privyDriver = require("../lib/drivers/privy");
    const requestedSol = req.body?.sol == null ? 1 : Number(req.body.sol);
    let before = null;
    try {
      before = await privyDriver.getBalance(walletRow.wallet_address);
    } catch {
      before = null;
    }
    const airdrop = await privyDriver.requestDevnetAirdrop(walletRow.wallet_address, requestedSol);
    let after = null;
    try {
      after = await privyDriver.getBalance(walletRow.wallet_address);
    } catch {
      after = null;
    }
    res.json({
      ok: true,
      wallet_address: walletRow.wallet_address,
      solana_cluster: privyDriver.getSolanaCluster(),
      requested_sol: airdrop.sol,
      requested_lamports: airdrop.lamports,
      tx_hash: airdrop.txHash,
      balance_before: before,
      balance_after: after,
    });
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
    const walletPolicy = require("../lib/wallet-policy");
    const walletAudit = require("../lib/wallet-audit");
    const effective = walletPolicy.getEffectivePolicy(walletRow);
    let privy_policy = null;
    try {
      privy_policy = await privyDriver.getPolicy(walletRow);
    } catch {
      /* optional */
    }
    let daily_spend_lamports = null;
    try {
      daily_spend_lamports = await walletAudit.getDailySpend(req.agent.id, walletRow.id);
    } catch {
      /* non-fatal */
    }
    res.json({
      wallet_address: walletRow.wallet_address,
      is_paused: Boolean(walletRow.is_paused),
      paused_at: walletRow.paused_at,
      paused_reason: walletRow.paused_reason,
      policy: effective,
      daily_spend_lamports,
      privy_policy,
    });
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
// MoonPay — signed widget URL (agent must POST /integrations/moonpay/connect first)
// ---------------------------------------------------------------------------

router.post("/moonpay/widget-url", authenticateBySessionOrKey, sanitizeBody([]), async (req, res, next) => {
  try {
    const status = await moonpayAdapter.getIntegrationStatus(req.agent.id);
    if (!status.connected) {
      return res.status(400).json({
        error: "MoonPay is not linked for this agent. POST /integrations/moonpay/connect first.",
      });
    }
    const cfg = status.config;
    const out = moonpayAdapter.buildWidgetUrlForAgent(req.agent.id, cfg, req.body || {});
    res.json(out);
  } catch (err) {
    const mapped = moonpayAdapter.mapConnectError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    next(err);
  }
});

router.post("/moonpay/fund-privy-wallet", authenticateBySessionOrKey, sanitizeBody([]), async (req, res, next) => {
  const walletRow = await requirePrivyWallet(req, res);
  if (!walletRow) return;
  try {
    let status = await moonpayAdapter.getIntegrationStatus(req.agent.id);
    let cfg = status.config;
    if (!status.connected) {
      const connected = await moonpayAdapter.connect(req.agent.id, {
        default_currency_code: "sol",
        default_wallet_address: walletRow.wallet_address,
      });
      cfg = connected.config;
      status = { connected: true, config: cfg };
    }

    const out = moonpayAdapter.buildWidgetUrlForAgent(req.agent.id, cfg, {
      ...req.body,
      currencyCode: "sol",
      walletAddress: walletRow.wallet_address,
    });
    res.json({
      ...out,
      wallet_address: walletRow.wallet_address,
      provider: "moonpay",
      target_provider: "privy_wallet",
      moonpay_connected: status.connected,
    });
  } catch (err) {
    const mapped = moonpayAdapter.mapConnectError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Phantom Wallet — linked pubkey; server-side sign/send not available (501)
// ---------------------------------------------------------------------------

router.post("/phantom_wallet/sign", authenticateBySessionOrKey, walletSignLimiter, async (req, res, next) => {
  const walletRow = await phantomWalletAdapter.requirePhantomWallet(req, res);
  if (!walletRow) return;
  try {
    const authMethod = req.clickrUser ? "session" : "api_key";
    const result = await phantomWalletAdapter.sign(req.agent.id, walletRow, req.body || {}, authMethod);
    res.json(result);
  } catch (err) {
    const mapped = phantomWalletAdapter.mapConnectError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    next(err);
  }
});

router.post("/phantom_wallet/send", authenticateBySessionOrKey, walletSendLimiter, async (req, res, next) => {
  const walletRow = await phantomWalletAdapter.requirePhantomWallet(req, res);
  if (!walletRow) return;
  try {
    const authMethod = req.clickrUser ? "session" : "api_key";
    const result = await phantomWalletAdapter.send(req.agent.id, walletRow, req.body || {}, authMethod);
    res.json(result);
  } catch (err) {
    const mapped = phantomWalletAdapter.mapConnectError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
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
        "This provider cannot be linked by editing config here. Use the provider connect flow (e.g. POST /integrations/bankr/connect).",
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
