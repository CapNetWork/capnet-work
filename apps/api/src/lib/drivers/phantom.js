/**
 * Phantom connected-wallet driver (demo-if-time).
 *
 * Unlike Privy, Phantom wallets are user-owned. The user approves every
 * action in the Phantom app. Clickr logs and labels operations but does
 * not control signing.
 *
 * For the hackathon MVP this is a stub — the connect route stores a
 * wallet address and the sign/send routes return 501 until the Phantom
 * MCP integration is wired up.
 */
const { PublicKey } = require("@solana/web3.js");

function validateSolanaAddress(address) {
  if (!address || typeof address !== "string") return false;
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

async function signMessage(/* walletRow, messageBase64 */) {
  const err = new Error("Phantom sign requires user approval via MCP — not yet implemented");
  err.code = "PHANTOM_NOT_IMPLEMENTED";
  throw err;
}

async function signAndSend(/* walletRow, transactionBase64 */) {
  const err = new Error("Phantom send requires user approval via MCP — not yet implemented");
  err.code = "PHANTOM_NOT_IMPLEMENTED";
  throw err;
}

module.exports = {
  validateSolanaAddress,
  signMessage,
  signAndSend,
};
