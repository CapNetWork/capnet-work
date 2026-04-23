/**
 * Privy agentic wallet driver.
 * Agent-controlled, developer-owned Solana wallets with TEE-secured keys.
 * Privy handles custody and policy enforcement; we handle audit + rate limiting.
 *
 * @privy-io/node is ESM-only so we lazy-load it via dynamic import().
 */
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");

const PRIVY_APP_ID = process.env.PRIVY_APP_ID || "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || "";
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

let _privyPromise;
async function getPrivyClient() {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    const err = new Error("PRIVY_APP_ID and PRIVY_APP_SECRET are required");
    err.code = "PRIVY_NOT_CONFIGURED";
    throw err;
  }
  if (!_privyPromise) {
    _privyPromise = import("@privy-io/node").then(({ PrivyClient }) => {
      // @privy-io/node expects a single options object.
      return new PrivyClient({ appId: PRIVY_APP_ID, appSecret: PRIVY_APP_SECRET });
    });
  }
  return _privyPromise;
}

let _connection;
function getSolanaConnection() {
  if (!_connection) {
    _connection = new Connection(SOLANA_RPC_URL, "confirmed");
  }
  return _connection;
}

function validateSolanaAddress(address) {
  if (!address || typeof address !== "string") return false;
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

async function createWallet() {
  const privy = await getPrivyClient();
  if (!privy?.wallets) {
    const err = new Error("Privy SDK client is missing wallets() — check @privy-io/node version");
    err.code = "PRIVY_SDK_INCOMPATIBLE";
    throw err;
  }
  const wallet = await privy.wallets().create({ chain_type: "solana" });
  return {
    publicKey: wallet.address,
    providerWalletId: wallet.id,
    providerPolicyId: null,
  };
}

async function getBalance(address) {
  const conn = getSolanaConnection();
  const pubkey = new PublicKey(address);
  const lamports = await conn.getBalance(pubkey);
  return {
    lamports,
    sol: lamports / LAMPORTS_PER_SOL,
  };
}

async function signMessage(walletRow, messageBase64) {
  const privy = await getPrivyClient();
  if (!privy?.wallets) {
    const err = new Error("Privy SDK client is missing wallets() — check @privy-io/node version");
    err.code = "PRIVY_SDK_INCOMPATIBLE";
    throw err;
  }
  const result = await privy.wallets().solana().signMessage(walletRow.provider_wallet_id, {
    message: messageBase64,
  });
  return { signature: result.signature || result.sig || result.result || null };
}

async function signAndSend(walletRow, transactionBase64) {
  const privy = await getPrivyClient();
  if (!privy?.wallets) {
    const err = new Error("Privy SDK client is missing wallets() — check @privy-io/node version");
    err.code = "PRIVY_SDK_INCOMPATIBLE";
    throw err;
  }
  const result = await privy.wallets().solana().signAndSendTransaction(walletRow.provider_wallet_id, {
    transaction: transactionBase64,
  });
  return { txHash: result.hash || result.signature || result.txHash || null };
}

async function getPolicy(walletRow) {
  if (!walletRow.provider_policy_id) return null;
  const privy = await getPrivyClient();
  try {
    if (!privy?.policies) return null;
    const policy = await privy.policies().get(walletRow.provider_wallet_id);
    return policy;
  } catch {
    return null;
  }
}

async function updatePolicy(walletRow, policyUpdate) {
  const privy = await getPrivyClient();
  if (!privy?.policies) {
    const err = new Error("Privy SDK client is missing policies() — check @privy-io/node version");
    err.code = "PRIVY_SDK_INCOMPATIBLE";
    throw err;
  }
  return await privy.policies().update(walletRow.provider_wallet_id, { policy: policyUpdate });
}

module.exports = {
  createWallet,
  getBalance,
  signMessage,
  signAndSend,
  getPolicy,
  updatePolicy,
  validateSolanaAddress,
  getSolanaConnection,
};
