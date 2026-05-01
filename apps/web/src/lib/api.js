/**
 * Resolves the CapNet / Clickr API base URL for server and client.
 * Prefer `API_URL` on the server (runtime, not inlined) so SSR matches your deploy.
 * `NEXT_PUBLIC_API_URL` is inlined at build time; set both on production web per deploy docs.
 *
 * On the server, pass `host` and `forwardedHost` from the request. We check **both** and
 * treat either as authoritative for staging so a mis-set `X-Forwarded-Host` (e.g. apex
 * `clickr.cc` in front of staging) does not force SSR to call production API while
 * `Host: staging.clickr.cc` is correct.
 *
 * @see docs/deploy-railway.md
 * @param {string} [host] `Host` header (first value).
 * @param {string} [forwardedHost] `X-Forwarded-Host` header (first value).
 */
function resolveApiBaseUrl(host = "", forwardedHost = "") {
  const candidates = [
    process.env.API_URL,
    process.env.NEXT_PUBLIC_API_URL,
    process.env.CAPNET_API_URL,
  ];
  for (const raw of candidates) {
    const v = typeof raw === "string" ? raw.trim() : "";
    if (v) return v.replace(/\/$/, "");
  }

  const fromHints = apiBaseUrlFromRequestHostHints(host, forwardedHost);
  if (fromHints) return fromHints;

  const fromBranch = inferStagingApiFromGitBranch();
  if (fromBranch) return fromBranch;

  const inferred = inferApiBaseUrlFromDeployHost();
  if (inferred) return inferred;

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

/** Vercel/Railway often expose the git branch; use when Host headers are missing or generic. */
function inferStagingApiFromGitBranch() {
  const b = (process.env.VERCEL_GIT_COMMIT_REF || process.env.RAILWAY_GIT_BRANCH || "").trim().toLowerCase();
  if (b === "staging") return "https://staging-api.clickr.cc";
  return null;
}

/**
 * Prefer staging when **any** of Host / X-Forwarded-Host clearly indicates the staging site,
 * then fall back to existing per-host rules (so prod clickr.cc still maps to prod API).
 */
function apiBaseUrlFromRequestHostHints(hostRaw, forwardedRaw) {
  const first = (v) => (typeof v === "string" ? v.split(",")[0].trim() : "");
  const hosts = [first(hostRaw), first(forwardedRaw)].filter(Boolean);
  for (const raw of hosts) {
    if (hostImpliesStagingClickrWeb(raw)) return "https://staging-api.clickr.cc";
  }
  for (const raw of hosts) {
    const mapped = apiBaseUrlFromHostHeader(raw);
    if (mapped) return mapped;
  }
  return null;
}

function hostImpliesStagingClickrWeb(rawHost) {
  let hostname = "";
  try {
    hostname = new URL(rawHost.includes("://") ? rawHost : `https://${rawHost}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (hostname === "staging.clickr.cc") return true;
  if (hostname.endsWith(".staging.clickr.cc")) return true;
  if (hostname.startsWith("staging.")) return true;
  return false;
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
  return resolveApiBaseUrl("", "");
}

export async function apiFetch(path, options = {}) {
  let host = "";
  let forwardedHost = "";
  if (typeof window === "undefined") {
    try {
      const { headers } = await import("next/headers");
      const h = await headers();
      // Prefer Host first for our own hostname; X-Forwarded-Host second (CDN may rewrite).
      host = h.get("host") || "";
      forwardedHost = h.get("x-forwarded-host") || "";
    } catch {
      // Outside a Next.js request (tests, scripts) or headers unavailable.
    }
  }
  const API_URL = resolveApiBaseUrl(host, forwardedHost);
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
