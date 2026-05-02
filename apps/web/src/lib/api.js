/**
 * Resolves the CapNet / Clickr API base URL for server and client.
 *
 * Host-based resolution runs **before** `API_URL` / `NEXT_PUBLIC_API_URL`. That way staging
 * `Host: staging.clickr.cc` (and matching client `window.location`) always hits staging API even
 * if the build inlined a production `NEXT_PUBLIC_API_URL` — which otherwise makes every SSR
 * profile fetch (`/agents/:id`) 404 against the wrong database.
 *
 * After that we use runtime env vars, then git-branch / deploy URL inference.
 *
 * @see docs/deploy-railway.md
 * @param {string} [host] `Host` header (first value).
 * @param {string} [forwardedHost] `X-Forwarded-Host` header (first value).
 */
function resolveApiBaseUrl(host = "", forwardedHost = "") {
  const fromHints = apiBaseUrlFromRequestHostHints(host, forwardedHost);
  if (fromHints) return fromHints;

  if (typeof window !== "undefined") {
    const fromBrowserHostname = apiBaseUrlFromBrowserHostname();
    if (fromBrowserHostname) return fromBrowserHostname;
  }

  const candidates = [
    process.env.API_URL,
    process.env.NEXT_PUBLIC_API_URL,
    process.env.CAPNET_API_URL,
  ];
  for (const raw of candidates) {
    const v = typeof raw === "string" ? raw.trim() : "";
    if (v) return v.replace(/\/$/, "");
  }

  const fromBranch = inferStagingApiFromGitBranch();
  if (fromBranch) return fromBranch;

  const inferred = inferApiBaseUrlFromDeployHost();
  if (inferred) return inferred;

  if (process.env.NODE_ENV === "production") {
    return "https://api.clickr.cc";
  }
  return "http://localhost:4000";
}

/** Client-only: derive API base from the page hostname (Host is not available in browser fetch). */
function apiBaseUrlFromBrowserHostname() {
  const hn = (window.location?.hostname || "").toLowerCase();
  if (!hn) return null;
  if (hostImpliesStagingClickrWeb(hn)) return "https://staging-api.clickr.cc";
  if (hn === "clickr.cc" || hn.endsWith(".clickr.cc")) return "https://api.clickr.cc";
  return null;
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

/** Fire-and-forget: append one NDJSON line under repo `.cursor/` (walk up from cwd). SSR only. */
function appendDebug689754Ndjson(entry) {
  void (async () => {
    if (typeof window !== "undefined") return;
    try {
      const fs = await import("fs");
      const path = await import("path");
      const payload = {
        sessionId: "689754",
        timestamp: Date.now(),
        ...entry,
      };
      let dir = process.cwd();
      for (let i = 0; i < 14; i++) {
        const cursorDir = path.join(dir, ".cursor");
        if (fs.existsSync(cursorDir)) {
          fs.appendFileSync(path.join(cursorDir, "debug-689754.log"), `${JSON.stringify(payload)}\n`);
          return;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    } catch {
      /* ignore */
    }
  })();
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
  const isAgentLookup = /^\/agents\/[^/]+$/.test(path || "") && !/^\/agents\/me$/i.test(path || "");
  // #region agent log
  if (typeof window === "undefined" && isAgentLookup) {
    appendDebug689754Ndjson({
      runId: "agent-profile-pre",
      hypothesisId: "H1_H2_HOST_API",
      location: "lib/api.js:apiFetch",
      message: "SSR agents lookup",
      data: {
        apiUrl: API_URL,
        path,
        httpStatus: res.status,
        ok: res.ok,
        hostSnippet: host ? `${String(host).slice(0, 64)}` : "",
        fwdSnippet: forwardedHost ? `${String(forwardedHost).slice(0, 64)}` : "",
      },
    });
    fetch("http://127.0.0.1:7833/ingest/a180f195-065b-4fd0-a5c5-d67f0ff3589a", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "689754" },
      body: JSON.stringify({
        sessionId: "689754",
        runId: "agent-profile-pre",
        hypothesisId: "H1_H2_HOST_API",
        location: "lib/api.js:apiFetch",
        message: "SSR agents lookup",
        data: {
          apiUrl: API_URL,
          path,
          httpStatus: res.status,
          ok: res.ok,
          hostSnippet: host ? `${String(host).slice(0, 64)}` : "",
          fwdSnippet: forwardedHost ? `${String(forwardedHost).slice(0, 64)}` : "",
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // #region agent log
    if (typeof window === "undefined" && isAgentLookup) {
      appendDebug689754Ndjson({
        runId: "agent-profile-pre",
        hypothesisId: "H3_H5_ERR",
        location: "lib/api.js:apiFetch",
        message: "agents lookup failure",
        data: {
          apiUrl: API_URL,
          path,
          httpStatus: res.status,
          errSnippet: String(data.error ?? res.statusText ?? "").slice(0, 300),
        },
      });
      fetch("http://127.0.0.1:7833/ingest/a180f195-065b-4fd0-a5c5-d67f0ff3589a", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "689754" },
        body: JSON.stringify({
          sessionId: "689754",
          runId: "agent-profile-pre",
          hypothesisId: "H3_H5_ERR",
          location: "lib/api.js:apiFetch",
          message: "agents lookup failure",
          data: {
            apiUrl: API_URL,
            path,
            httpStatus: res.status,
            errSnippet: String(data.error ?? res.statusText ?? "").slice(0, 300),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    }
    // #endregion
    throw new Error(data.error || res.statusText);
  }
  return res.json();
}
