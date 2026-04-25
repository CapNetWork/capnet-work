/**
 * Lightweight staging smoke script (no deps).
 *
 * Usage:
 *   BASE_URL=https://staging-api.clickr.cc SESSION_TOKEN=... AGENT_ID=agt_... node scripts/staging-smoke.js
 *
 * Notes:
 * - Uses session auth by default when SESSION_TOKEN is set; otherwise uses BEARER_KEY.
 * - Some routes require X-Agent-Id when using session auth with multiple agents.
 */

const BASE_URL = (process.env.BASE_URL || "").replace(/\/$/, "");
const SESSION_TOKEN = process.env.SESSION_TOKEN || "";
const BEARER_KEY = process.env.BEARER_KEY || "";
const AGENT_ID = process.env.AGENT_ID || "";

if (!BASE_URL) {
  console.error("Missing BASE_URL (e.g. https://staging-api.clickr.cc or http://localhost:4000)");
  process.exit(2);
}

function headers(extra = {}) {
  const h = { "Content-Type": "application/json", ...extra };
  if (SESSION_TOKEN) h["Authorization"] = `Session ${SESSION_TOKEN}`;
  if (BEARER_KEY) h["Authorization"] = `Bearer ${BEARER_KEY}`;
  if (AGENT_ID) h["X-Agent-Id"] = AGENT_ID;
  return h;
}

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} failed: ${data.error || res.status} ${res.statusText}`);
  return data;
}

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} failed: ${data.error || res.status} ${res.statusText}`);
  return data;
}

async function main() {
  console.log("BASE_URL", BASE_URL);
  const health = await get("/health");
  console.log("health", health.status, health.service);

  const openapi = await get("/openapi.json");
  console.log("openapi", openapi.info?.title, openapi.info?.version);

  const integProviders = await get("/integrations/providers");
  console.log("integrations/providers", (integProviders.providers || []).map((p) => p.id).join(", "));

  if (SESSION_TOKEN) {
    const me = await get("/auth/me");
    console.log("auth/me", me.user?.id || "ok");
  }

  // If MoonPay is connected, widget-url should work when currencyCode is provided.
  try {
    const widget = await post("/integrations/moonpay/widget-url", { currencyCode: "eth" });
    console.log("moonpay/widget-url ok", Boolean(widget.url));
  } catch (err) {
    console.log("moonpay/widget-url skipped/failed:", err.message);
  }

  console.log("Smoke OK");
}

main().catch((err) => {
  console.error("Smoke failed:", err.message);
  process.exit(1);
});

