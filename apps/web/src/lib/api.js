/**
 * Resolves the CapNet / Clickr API base URL for server and client.
 * Prefer `API_URL` on the server (runtime, not inlined) so SSR matches your deploy.
 * `NEXT_PUBLIC_API_URL` is inlined at build time; set both on production web per deploy docs.
 *
 * On the server, pass `hostHint` from the incoming request (e.g. `Host` / `X-Forwarded-Host`)
 * so staging web (`staging.clickr.cc`) talks to `staging-api.clickr.cc` even when deploy
 * env vars omit `API_URL`. Without this, SSR defaults to production API and arena detail
 * pages 404 right after creating a contract on staging.
 *
 * @see docs/deploy-railway.md
 * @param {string} [hostHint] Request host header (server / apiFetch only).
 */
function resolveApiBaseUrl(hostHint = "") {
  const candidates = [
    process.env.API_URL,
    process.env.NEXT_PUBLIC_API_URL,
    process.env.CAPNET_API_URL,
  ];
  for (const raw of candidates) {
    const v = typeof raw === "string" ? raw.trim() : "";
    if (v) return v.replace(/\/$/, "");
  }

  const inferred = inferApiBaseUrlFromDeployHost();
  if (inferred) return inferred;

  const fromHint = apiBaseUrlFromHostHeader(hostHint);
  if (fromHint) return fromHint;

  // If web deploy variables are missing, fall back to a hostname-based default in the browser.
  // This keeps staging domains working even if API_URL/NEXT_PUBLIC_API_URL weren't set at deploy time.
  if (typeof window !== "undefined") {
    const host = window.location?.hostname || "";
    if (host.includes("staging.")) return "https://staging-api.clickr.cc";
    if (host.endsWith("clickr.cc") || host.includes("clickr.cc")) return "https://api.clickr.cc";
  }
  if (process.env.NODE_ENV === "production") {
    return "https://api.clickr.cc";
  }
  return "http://localhost:4000";
}

/** @param {string} rawHost Host or X-Forwarded-Host (first value if comma-separated). */
function apiBaseUrlFromHostHeader(rawHost) {
  const first = typeof rawHost === "string" ? rawHost.split(",")[0].trim() : "";
  if (!first) return null;
  let hostname = first;
  try {
    hostname = new URL(first.includes("://") ? first : `https://${first}`).hostname;
  } catch {
    return null;
  }
  const h = hostname.toLowerCase();
  if (h.includes("staging.")) return "https://staging-api.clickr.cc";
  if (h === "clickr.cc" || h.endsWith(".clickr.cc")) return "https://api.clickr.cc";
  return null;
}

function inferApiBaseUrlFromDeployHost() {
  const envName = [
    process.env.RAILWAY_ENVIRONMENT_NAME,
    process.env.VERCEL_ENV,
    process.env.DEPLOY_ENV,
    process.env.NODE_ENV,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (envName.includes("staging")) return "https://staging-api.clickr.cc";

  const hostCandidates = [
    process.env.NEXT_PUBLIC_APP_ORIGIN,
    process.env.APP_ORIGIN,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN,
    process.env.RAILWAY_STATIC_URL,
    process.env.VERCEL_URL,
  ];
  for (const raw of hostCandidates) {
    const host = hostnameFromEnvUrl(raw);
    if (!host) continue;
    if (host.includes("staging.")) return "https://staging-api.clickr.cc";
    if (host === "clickr.cc" || host.endsWith(".clickr.cc")) return "https://api.clickr.cc";
  }
  return null;
}

function hostnameFromEnvUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    return "";
  }
}

export function getApiBaseUrl() {
  return resolveApiBaseUrl();
}

export async function apiFetch(path, options = {}) {
  let hostHint = "";
  if (typeof window === "undefined") {
    try {
      const { headers } = await import("next/headers");
      const h = await headers();
      hostHint = h.get("x-forwarded-host") || h.get("host") || "";
    } catch {
      // Outside a Next.js request (tests, scripts) or headers unavailable.
    }
  }
  const API_URL = resolveApiBaseUrl(hostHint);
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || res.statusText);
  }
  return res.json();
}
