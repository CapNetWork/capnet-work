/**
 * SIWE nonces + verification for Clickr Connect wallet linking (separate store from /base).
 */
const crypto = require("crypto");
const { ethers } = require("ethers");
const { SiweMessage } = require("siwe");

const NONCE_TTL_MS = Number(process.env.CLICKR_CONNECT_SIWE_NONCE_TTL_MS || 5 * 60 * 1000);

const nonces = new Map();

function now() {
  return Date.now();
}

function cleanupNonces() {
  const t = now();
  for (const [nonce, exp] of nonces.entries()) {
    if (exp <= t) nonces.delete(nonce);
  }
}

function issueNonce() {
  cleanupNonces();
  const nonce = crypto.randomBytes(16).toString("hex");
  nonces.set(nonce, now() + NONCE_TTL_MS);
  return { nonce, expires_at: new Date(now() + NONCE_TTL_MS).toISOString() };
}

function consumeNonce(nonce) {
  cleanupNonces();
  const exp = nonces.get(nonce);
  if (!exp || exp <= now()) {
    nonces.delete(nonce);
    return false;
  }
  nonces.delete(nonce);
  return true;
}

function getAllowedSiweDomains() {
  const raw = process.env.SIWE_ALLOWED_DOMAINS || process.env.SIWE_DOMAIN;
  if (raw && String(raw).trim()) {
    return String(raw)
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return ["localhost:3000", "127.0.0.1:3000"];
}

function expectedSiweChainId() {
  return Number(process.env.BASE_CHAIN_ID || process.env.ERC8004_CHAIN_ID || 8453);
}

let providerCache;
function getSiweRpcProvider() {
  if (providerCache !== undefined) return providerCache;
  const url = process.env.BASE_RPC_URL || process.env.ERC8004_RPC_URL || "https://mainnet.base.org";
  try {
    providerCache = new ethers.JsonRpcProvider(url);
  } catch {
    providerCache = null;
  }
  return providerCache;
}

function normalizeWallet(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return ethers.getAddress(value.trim());
  } catch {
    return null;
  }
}

/**
 * Verify SIWE and return checksummed address + chainId from message.
 */
async function verifySiweWalletLink(messageStr, signature) {
  let siweMessage;
  try {
    siweMessage = new SiweMessage(messageStr);
  } catch {
    return { ok: false, error: "Invalid SIWE message" };
  }

  const allowedDomains = getAllowedSiweDomains();
  const msgDomain = String(siweMessage.domain || "").toLowerCase();
  if (!allowedDomains.includes(msgDomain)) {
    return { ok: false, error: "SIWE domain is not allowed for this deployment" };
  }

  const wantChain = expectedSiweChainId();
  if (Number(siweMessage.chainId) !== wantChain) {
    return { ok: false, error: `SIWE chainId must be ${wantChain}` };
  }

  if (!consumeNonce(siweMessage.nonce)) {
    return { ok: false, error: "Nonce missing or expired. GET /connect/auth/siwe/nonce first." };
  }

  let verifiedOk = false;
  try {
    const provider = getSiweRpcProvider();
    const result = await siweMessage.verify(
      { signature, domain: siweMessage.domain, nonce: siweMessage.nonce },
      { provider, suppressExceptions: true }
    );
    if (result.success) verifiedOk = true;
  } catch {
    /* EOA fallback below */
  }

  if (!verifiedOk) {
    try {
      const prepared = siweMessage.prepareMessage();
      const recovered = normalizeWallet(ethers.verifyMessage(prepared, signature));
      const claimed = normalizeWallet(siweMessage.address);
      if (recovered && claimed && recovered === claimed) verifiedOk = true;
    } catch {
      /* ignore */
    }
  }

  if (!verifiedOk) {
    return {
      ok: false,
      error:
        "SIWE verification failed. Smart wallets need BASE_RPC_URL or ERC8004_RPC_URL on the API.",
    };
  }

  const wallet = normalizeWallet(siweMessage.address);
  if (!wallet) return { ok: false, error: "Invalid address in SIWE message" };

  return { ok: true, address: wallet, chain_id: Number(siweMessage.chainId) };
}

module.exports = {
  issueNonce,
  verifySiweWalletLink,
  normalizeWallet,
  /** Store address lowercase in DB */
  addressForDb(checksummed) {
    return checksummed ? checksummed.toLowerCase() : null;
  },
};
