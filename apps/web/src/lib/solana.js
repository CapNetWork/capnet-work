export const SOL_MINT = "So11111111111111111111111111111111111111112";

const EXPLORER_BASE = (
  process.env.NEXT_PUBLIC_SOL_EXPLORER_BASE || "https://solscan.io"
).replace(/\/$/, "");
const SOLANA_CLUSTER = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "mainnet-beta").toLowerCase();

function clusterQuery() {
  if (!SOLANA_CLUSTER || SOLANA_CLUSTER === "mainnet" || SOLANA_CLUSTER === "mainnet-beta") return "";
  return `?cluster=${encodeURIComponent(SOLANA_CLUSTER)}`;
}

export function txExplorerUrl(txHash) {
  if (!txHash) return null;
  return `${EXPLORER_BASE}/tx/${txHash}${clusterQuery()}`;
}

export function addressExplorerUrl(addr) {
  if (!addr) return null;
  return `${EXPLORER_BASE}/account/${addr}${clusterQuery()}`;
}

export function shortTxHash(hash) {
  if (!hash || typeof hash !== "string") return "";
  return hash.length > 12 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;
}

export function isDevnet() {
  return SOLANA_CLUSTER === "devnet";
}

export const SOLANA_CLUSTER_NAME = SOLANA_CLUSTER;

export function proofLabel({ short = false } = {}) {
  if (isDevnet()) return short ? "View devnet proof" : "View devnet proof transaction";
  return short ? "View Solana tx" : "View Solana transaction";
}
