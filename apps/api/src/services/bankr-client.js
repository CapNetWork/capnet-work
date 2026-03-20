/**
 * Bankr HTTP integration on first-party Agent API primitives:
 * - GET /agent/me
 * - POST /agent/prompt
 * - GET /agent/job/:jobId
 * - POST /agent/sign
 * - POST /agent/submit
 */

async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { _raw: text };
  }
}

function baseUrl() {
  return String(process.env.BANKR_API_BASE_URL || "https://api.bankr.bot").replace(/\/$/, "");
}

function headers(apiKey, withJson = false) {
  const h = {
    Accept: "application/json",
    "X-API-Key": apiKey,
  };
  if (withJson) h["Content-Type"] = "application/json";
  return h;
}

function isEvmAddress(v) {
  return typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v.trim());
}

function firstString(values) {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickWalletFromArray(arr, chainMatcher) {
  if (!Array.isArray(arr)) return null;
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const chain = String(item.chain || item.network || item.type || "").toLowerCase();
    if (chainMatcher(chain)) {
      const addr = firstString([item.address, item.wallet, item.walletAddress, item.publicKey]);
      if (addr) return addr;
    }
    const fallbackAddr = firstString([item.address, item.wallet, item.walletAddress, item.publicKey]);
    if (fallbackAddr && chainMatcher("")) return fallbackAddr;
  }
  return null;
}

function normalizeWallets(me) {
  const data = me?.data || {};
  const wallets = me?.wallets || data.wallets || {};
  const walletList = me?.wallets_list || data.wallets_list || me?.addresses || data.addresses || [];

  const evmDirect = firstString([
    wallets.evm,
    wallets.ethereum,
    wallets.base,
    me?.wallet_address,
    me?.walletAddress,
    me?.evm_wallet,
    data?.wallet_address,
    data?.evm_wallet,
  ]);
  const evmFromList =
    pickWalletFromArray(walletList, (chain) => chain.includes("evm") || chain.includes("eth") || chain.includes("base")) ||
    pickWalletFromArray(Array.isArray(wallets) ? wallets : null, (chain) => chain.includes("evm") || chain.includes("eth") || chain.includes("base"));
  const evmHeuristic = [me?.address, me?.wallet, data?.address, data?.wallet].find((v) => isEvmAddress(v)) || null;

  const solDirect = firstString([wallets.solana, wallets.sol, me?.solana_wallet, me?.solanaWallet, data?.solana_wallet]);
  const solFromList =
    pickWalletFromArray(walletList, (chain) => chain.includes("sol")) ||
    pickWalletFromArray(Array.isArray(wallets) ? wallets : null, (chain) => chain.includes("sol"));

  const evm = evmDirect || evmFromList || evmHeuristic || null;
  const solana = solDirect || solFromList || null;
  return {
    evm_wallet: typeof evm === "string" ? evm.trim() : null,
    solana_wallet: typeof solana === "string" ? solana.trim() : null,
  };
}

function normalizeSocials(me) {
  const src = me?.socials || me?.profiles || me?.accounts || {};
  return {
    x_username: typeof src.x === "string" ? src.x : typeof src.twitter === "string" ? src.twitter : null,
    farcaster_username:
      typeof src.farcaster === "string" ? src.farcaster : typeof src.warpcast === "string" ? src.warpcast : null,
  };
}

function inferConnectionState(me) {
  const perms = me?.permissions || me?.apiKey || {};
  const readOnly = Boolean(perms.readOnly || perms.read_only);
  const agentEnabled = perms.agentApiEnabled ?? perms.agent_api_enabled;
  if (agentEnabled === false) return "connected_readonly";
  return readOnly ? "connected_readonly" : "connected_active";
}

async function getMe(apiKey) {
  if (process.env.BANKR_DEV_SKIP_VALIDATE === "1") {
    return {
      evm_wallet: process.env.BANKR_DEV_MOCK_WALLET || "0x0000000000000000000000000000000000000000",
      solana_wallet: process.env.BANKR_DEV_MOCK_SOLANA_WALLET || null,
      x_username: "dev_mode",
      farcaster_username: null,
      connection_state: "connected_active",
      raw: { dev: true },
    };
  }

  const res = await fetch(`${baseUrl()}/agent/me`, {
    method: "GET",
    headers: headers(apiKey),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const msg = data.error || data.message || res.statusText;
    throw new Error(typeof msg === "string" ? msg : `Bankr /agent/me failed (${res.status})`);
  }
  return {
    ...normalizeWallets(data),
    ...normalizeSocials(data),
    connection_state: inferConnectionState(data),
    raw: data,
  };
}

async function createPromptJob(apiKey, prompt) {
  if (process.env.BANKR_DEV_SKIP_VALIDATE === "1") {
    return { job_id: `dev_${Date.now()}`, thread_id: `thread_${Date.now()}`, status: "queued" };
  }
  const res = await fetch(`${baseUrl()}/agent/prompt`, {
    method: "POST",
    headers: headers(apiKey, true),
    body: JSON.stringify({ prompt }),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const msg = data.error || data.message || res.statusText;
    throw new Error(typeof msg === "string" ? msg : `Bankr /agent/prompt failed (${res.status})`);
  }
  return {
    job_id: data.jobId || data.job_id || data.id || null,
    thread_id: data.threadId || data.thread_id || null,
    status: data.status || "queued",
    raw: data,
  };
}

async function getJob(apiKey, jobId) {
  if (process.env.BANKR_DEV_SKIP_VALIDATE === "1") {
    return { status: "completed", raw: { dev: true, jobId } };
  }
  const res = await fetch(`${baseUrl()}/agent/job/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: headers(apiKey),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const msg = data.error || data.message || res.statusText;
    throw new Error(typeof msg === "string" ? msg : `Bankr /agent/job failed (${res.status})`);
  }
  return { status: data.status || "unknown", raw: data };
}

async function sign(apiKey, payload) {
  const res = await fetch(`${baseUrl()}/agent/sign`, {
    method: "POST",
    headers: headers(apiKey, true),
    body: JSON.stringify(payload),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const msg = data.error || data.message || res.statusText;
    throw new Error(typeof msg === "string" ? msg : `Bankr /agent/sign failed (${res.status})`);
  }
  return data;
}

async function submit(apiKey, transaction) {
  const res = await fetch(`${baseUrl()}/agent/submit`, {
    method: "POST",
    headers: headers(apiKey, true),
    body: JSON.stringify(transaction),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const msg = data.error || data.message || res.statusText;
    throw new Error(typeof msg === "string" ? msg : `Bankr /agent/submit failed (${res.status})`);
  }
  return data;
}

module.exports = { getMe, createPromptJob, getJob, sign, submit };
