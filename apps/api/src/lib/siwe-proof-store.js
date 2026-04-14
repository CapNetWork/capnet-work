/**
 * Shared SIWE nonce + proof_token store.
 * Used by /base, /auth, and /connect routes.
 */
const crypto = require("crypto");
const { ethers } = require("ethers");
const { SiweMessage } = require("siwe");

const SIWE_NONCE_TTL_MS = Number(
  process.env.BASE_AUTH_SIWE_NONCE_TTL_MS || process.env.BASE_AUTH_CHALLENGE_TTL_MS || 5 * 60 * 1000
);
const VERIFIED_TTL_MS = Number(process.env.BASE_AUTH_VERIFIED_TTL_MS || 10 * 60 * 1000);

const siweNonces = new Map();
const verifiedProofs = new Map();

function now() {
  return Date.now();
}

function cleanup() {
  const ts = now();
  for (const [nonce, item] of siweNonces.entries()) {
    if (item.expiresAt <= ts) siweNonces.delete(nonce);
  }
  for (const [token, item] of verifiedProofs.entries()) {
    if (item.expiresAt <= ts) verifiedProofs.delete(token);
  }
}

function normalizeWallet(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return ethers.getAddress(value.trim());
  } catch {
    return null;
  }
}

function addressForDb(checksummed) {
  return checksummed ? checksummed.toLowerCase() : null;
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

let rpcProviderCache;
function getSiweRpcProvider() {
  if (rpcProviderCache !== undefined) return rpcProviderCache;
  const url = process.env.BASE_RPC_URL || process.env.ERC8004_RPC_URL || "https://mainnet.base.org";
  try {
    rpcProviderCache = new ethers.JsonRpcProvider(url);
  } catch {
    rpcProviderCache = null;
  }
  return rpcProviderCache;
}

function issueNonce() {
  cleanup();
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = now() + SIWE_NONCE_TTL_MS;
  siweNonces.set(nonce, { expiresAt });
  return { nonce, expires_at: new Date(expiresAt).toISOString() };
}

/**
 * Full SIWE verify: parse message, check domain/chain/nonce, verify sig (EIP-1271 + EOA fallback).
 * Returns { ok, wallet, chainId, error? }.
 */
async function verifySiweMessage(messageStr, signature) {
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
    return { ok: false, error: `SIWE chainId must be ${wantChain} (Base)` };
  }

  const nonceEntry = siweNonces.get(siweMessage.nonce);
  if (!nonceEntry || nonceEntry.expiresAt <= now()) {
    return { ok: false, error: "Nonce missing or expired. Request a new nonce." };
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
    /* fall through to EOA fallback */
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
        "SIWE verification failed. Smart wallets need BASE_RPC_URL or ERC8004_RPC_URL on the API (Base mainnet). Try again or use a standard EOA.",
    };
  }

  siweNonces.delete(siweMessage.nonce);

  const wallet = normalizeWallet(siweMessage.address);
  if (!wallet) return { ok: false, error: "Invalid address in SIWE message" };

  return { ok: true, wallet, chainId: Number(siweMessage.chainId) };
}

/**
 * Issue a short-lived proof_token after successful SIWE verification.
 */
function issueProofToken(wallet) {
  const proofToken = crypto.randomBytes(24).toString("hex");
  const expiresAt = now() + VERIFIED_TTL_MS;
  verifiedProofs.set(proofToken, { wallet, expiresAt });
  return { proof_token: proofToken, expires_at: new Date(expiresAt).toISOString() };
}

function verifyProofToken(wallet, proofToken) {
  if (!proofToken || typeof proofToken !== "string") return false;
  const item = verifiedProofs.get(proofToken);
  if (!item) return false;
  if (item.expiresAt <= now()) {
    verifiedProofs.delete(proofToken);
    return false;
  }
  return item.wallet === wallet;
}

module.exports = {
  issueNonce,
  verifySiweMessage,
  issueProofToken,
  verifyProofToken,
  normalizeWallet,
  addressForDb,
  getAllowedSiweDomains,
  expectedSiweChainId,
};
