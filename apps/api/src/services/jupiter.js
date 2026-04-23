/**
 * Thin Jupiter v6 HTTP wrapper.
 *
 *   getTokenMetadata(mint)                    — token list lookup (best-effort)
 *   getQuote({ inputMint, outputMint, amount, slippageBps, platformFeeBps })
 *   getSwapTransaction({ quote, userPublicKey, feeAccount }) — execute-only (deferred)
 *   getPrice(mints[])                          — price API
 *
 * Uses the global fetch (Node >= 18). No external SDK dep to keep the boot path
 * tiny and the surface easy to swap if Jupiter's endpoints move again.
 */

const JUPITER_API_BASE = process.env.JUPITER_API_BASE || "https://quote-api.jup.ag/v6";
const JUPITER_PRICE_BASE = process.env.JUPITER_PRICE_BASE || "https://price.jup.ag/v6";
const JUPITER_TOKEN_API_BASE = process.env.JUPITER_TOKEN_API_BASE || "https://tokens.jup.ag";
const HTTP_TIMEOUT_MS = Number(process.env.JUPITER_HTTP_TIMEOUT_MS) || 10000;

async function httpGet(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`Jupiter GET ${url} failed: ${res.status} ${text.slice(0, 240)}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function httpPostJson(url, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`Jupiter POST ${url} failed: ${res.status} ${text.slice(0, 240)}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getTokenMetadata(mint) {
  if (!mint || typeof mint !== "string") throw new Error("mint required");
  try {
    return await httpGet(`${JUPITER_TOKEN_API_BASE}/token/${encodeURIComponent(mint)}`);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

async function getQuote({ inputMint, outputMint, amount, slippageBps = 50, platformFeeBps }) {
  if (!inputMint || !outputMint) throw new Error("inputMint + outputMint required");
  if (amount == null || !(Number(amount) > 0)) throw new Error("amount must be positive");
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amount),
    slippageBps: String(slippageBps),
  });
  if (platformFeeBps != null && Number.isFinite(Number(platformFeeBps))) {
    params.set("platformFeeBps", String(platformFeeBps));
  }
  return await httpGet(`${JUPITER_API_BASE}/quote?${params.toString()}`);
}

async function getSwapTransaction({ quote, userPublicKey, feeAccount, wrapAndUnwrapSol = true }) {
  if (!quote) throw new Error("quote required");
  if (!userPublicKey) throw new Error("userPublicKey required");
  const body = {
    quoteResponse: quote,
    userPublicKey,
    wrapAndUnwrapSol,
    ...(feeAccount ? { feeAccount } : {}),
  };
  return await httpPostJson(`${JUPITER_API_BASE}/swap`, body);
}

async function getPrice(mints) {
  if (!Array.isArray(mints) || mints.length === 0) return { data: {} };
  const ids = mints.filter((m) => typeof m === "string" && m.length > 0).join(",");
  if (!ids) return { data: {} };
  return await httpGet(`${JUPITER_PRICE_BASE}/price?ids=${encodeURIComponent(ids)}`);
}

module.exports = {
  getTokenMetadata,
  getQuote,
  getSwapTransaction,
  getPrice,
  JUPITER_API_BASE,
  JUPITER_PRICE_BASE,
  JUPITER_TOKEN_API_BASE,
};
