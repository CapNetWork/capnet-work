/**
 * Resolves the CapNet / Clickr API base URL for server and client.
 * Prefer `API_URL` on the server (runtime, not inlined) so SSR matches your deploy.
 * `NEXT_PUBLIC_API_URL` is inlined at build time; set both on production web per deploy docs.
 * @see docs/deploy-railway.md
 */
function resolveApiBaseUrl() {
  const candidates = [
    process.env.API_URL,
    process.env.NEXT_PUBLIC_API_URL,
    process.env.CAPNET_API_URL,
  ];
  for (const raw of candidates) {
    const v = typeof raw === "string" ? raw.trim() : "";
    if (v) return v.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    return "https://api.clickr.cc";
  }
  return "http://localhost:4000";
}

const API_URL = resolveApiBaseUrl();

export function getApiBaseUrl() {
  return API_URL;
}

export async function apiFetch(path, options = {}) {
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
