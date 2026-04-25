/**
 * MoonPay — agent-scoped on/off ramp configuration + signed widget URLs.
 * Secrets live in env; public/summary fields only in agents.metadata.integrations.moonpay.
 */
const { getProviderConfig, upsertProviderConfig, deleteProviderConfig } = require("../store");
const { buildSignedWidgetUrl } = require("../moonpay-crypto");

const PROVIDER_ID = "moonpay";

function publishableKey() {
  return process.env.MOONPAY_PUBLISHABLE_KEY || "";
}

function secretKey() {
  return process.env.MOONPAY_SECRET_KEY || "";
}

function widgetBaseUrl() {
  return process.env.MOONPAY_WIDGET_BASE_URL || "https://buy.moonpay.com";
}

function ensureKeysForConnect() {
  if (!publishableKey() || !secretKey()) {
    const err = new Error("MOONPAY_PUBLISHABLE_KEY and MOONPAY_SECRET_KEY are required");
    err.code = "MOONPAY_NOT_CONFIGURED";
    throw err;
  }
}

async function connect(agentId, input = {}) {
  const externalCustomerId =
    typeof input.external_customer_id === "string" && input.external_customer_id.trim()
      ? input.external_customer_id.trim()
      : agentId;

  const saved = await upsertProviderConfig(agentId, PROVIDER_ID, {
    connection_status: "connected",
    external_customer_id: externalCustomerId,
    default_currency_code: input.default_currency_code || input.currencyCode || null,
    default_wallet_address: input.default_wallet_address || input.walletAddress || null,
    environment: input.environment === "sandbox" ? "sandbox" : "production",
  });

  return {
    ok: true,
    provider: PROVIDER_ID,
    config: {
      external_customer_id: saved.external_customer_id,
      default_currency_code: saved.default_currency_code,
      default_wallet_address: saved.default_wallet_address,
      linked_at: saved.linked_at,
    },
  };
}

async function getIntegrationStatus(agentId) {
  const cfg = await getProviderConfig(agentId, PROVIDER_ID);
  if (!cfg || cfg.connection_status !== "connected") {
    return { connected: false, provider: PROVIDER_ID };
  }
  return {
    connected: true,
    provider: PROVIDER_ID,
    config: {
      external_customer_id: cfg.external_customer_id || agentId,
      default_currency_code: cfg.default_currency_code || null,
      default_wallet_address: cfg.default_wallet_address || null,
      environment: cfg.environment || "production",
      last_webhook_at: cfg.last_webhook_at || null,
      last_webhook_type: cfg.last_webhook_type || null,
      linked_at: cfg.linked_at,
      updated_at: cfg.updated_at,
    },
  };
}

/**
 * Build a signed buy/sell widget URL. Chain-agnostic: pass currencyCode + walletAddress for any supported asset.
 */
function buildWidgetUrlForAgent(agentId, cfg, body = {}) {
  ensureKeysForConnect();
  const pk = publishableKey();
  const ext = cfg.external_customer_id || agentId;
  const wallet =
    body.walletAddress ||
    body.wallet_address ||
    cfg.default_wallet_address ||
    undefined;
  const rawCur = body.currencyCode || body.currency_code || cfg.default_currency_code;
  if (!rawCur || !String(rawCur).trim()) {
    const err = new Error("currencyCode is required (or set default_currency_code on connect)");
    err.code = "MOONPAY_BAD_INPUT";
    throw err;
  }
  const currencyCode = String(rawCur).trim().toLowerCase();

  const params = {
    apiKey: pk,
    externalCustomerId: ext,
    currencyCode,
  };
  if (wallet) params.walletAddress = wallet;
  if (body.baseCurrencyCode || body.base_currency_code) {
    params.baseCurrencyCode = String(body.baseCurrencyCode || body.base_currency_code).toLowerCase();
  }
  if (body.redirectUrl || body.redirect_url) {
    params.redirectURL = String(body.redirectUrl || body.redirect_url);
  }

  const url = buildSignedWidgetUrl(widgetBaseUrl(), secretKey(), params);
  return { url, external_customer_id: ext, currency_code: currencyCode };
}

async function disconnect(agentId) {
  await deleteProviderConfig(agentId, PROVIDER_ID);
  return { ok: true, provider: PROVIDER_ID, removed: true };
}

function forbidDirectConfigPut() {
  return true;
}

function readConnectInput(body) {
  if (!body || typeof body !== "object") return {};
  return {
    external_customer_id: body.external_customer_id,
    default_currency_code: body.default_currency_code || body.currencyCode,
    default_wallet_address: body.default_wallet_address || body.walletAddress,
    environment: body.environment,
  };
}

function mapConnectError(err) {
  if (!err) return null;
  if (err.code === "MOONPAY_NOT_CONFIGURED") return { status: 503, error: err.message };
  if (err.code === "MOONPAY_BAD_INPUT") return { status: 400, error: err.message };
  return null;
}

module.exports = {
  PROVIDER_ID,
  connect,
  getIntegrationStatus,
  disconnect,
  forbidDirectConfigPut,
  readConnectInput,
  mapConnectError,
  buildWidgetUrlForAgent,
};
