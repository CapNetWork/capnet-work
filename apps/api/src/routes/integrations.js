const { Router } = require("express");
const { authenticateAgent } = require("../middleware/auth");
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

/** Providers with custom persistence (DB, external APIs). Keys must match registry ids. */
const ADAPTERS = {
  bankr: bankrAdapter,
  agentmail: agentmailAdapter,
};

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

router.get("/providers", authenticateAgent, async (_req, res) => {
  const providers = listProviders().map((provider) => ({
    id: provider.id,
    display_name: provider.display_name,
    category: provider.category,
    supports: provider.supports,
  }));
  res.json({ providers });
});

router.post("/agentmail/link", authenticateAgent, async (req, res, next) => {
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

router.post("/agentmail/send", authenticateAgent, sanitizeBody(["to", "subject", "text"]), async (req, res, next) => {
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

router.get("/agentmail/inbox", authenticateAgent, async (req, res, next) => {
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

router.get("/", authenticateAgent, async (req, res, next) => {
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

router.get("/:providerId/status", authenticateAgent, async (req, res, next) => {
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

router.put("/:providerId/config", authenticateAgent, sanitizeBody([]), async (req, res, next) => {
  const provider = getProvider(req.params.providerId);
  if (!provider) return res.status(404).json({ error: "Unsupported provider" });

  const adapter = ADAPTERS[provider.id];
  if (adapter?.forbidDirectConfigPut?.()) {
    return res.status(400).json({
      error:
        "This provider cannot be linked by editing config here. Use the provider connect flow (e.g. POST /api/bankr/connect or POST /integrations/agentmail/link).",
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

router.delete("/:providerId/config", authenticateAgent, async (req, res, next) => {
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
