/**
 * Privy agentic wallet driver.
 * Agent-controlled, developer-owned Solana wallets with TEE-secured keys.
 * Privy handles custody and policy enforcement; we handle audit + rate limiting.
 *
 * @privy-io/node is ESM-only so we lazy-load it via dynamic import().
 */
const {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} = require("@solana/web3.js");

const PRIVY_APP_ID = process.env.PRIVY_APP_ID || "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || "";
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const SOLANA_CLUSTER = (process.env.SOLANA_CLUSTER || "").trim().toLowerCase();
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

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

function getSolanaCluster() {
  if (SOLANA_CLUSTER) return SOLANA_CLUSTER;
  const rpc = SOLANA_RPC_URL.toLowerCase();
  if (rpc.includes("devnet")) return "devnet";
  if (rpc.includes("testnet")) return "testnet";
  if (rpc.includes("localhost") || rpc.includes("127.0.0.1")) return "localnet";
  if (rpc.includes("mainnet")) return "mainnet-beta";
  return "custom";
}

function isDevnet() {
  return getSolanaCluster() === "devnet";
}

function requireDevnet(action) {
  if (isDevnet()) return;
  const err = new Error(`${action} is only available when SOLANA_CLUSTER=devnet or SOLANA_RPC_URL points to devnet`);
  err.code = "SOLANA_DEVNET_REQUIRED";
  throw err;
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

async function createWalletForChain(chainType) {
  const t = String(chainType || "").trim().toLowerCase();
  if (!t) {
    const err = new Error("chainType is required");
    err.code = "PRIVY_BAD_CHAIN";
    throw err;
  }
  if (t !== "solana" && t !== "ethereum") {
    const err = new Error("Unsupported Privy chainType (expected 'solana' or 'ethereum')");
    err.code = "PRIVY_BAD_CHAIN";
    throw err;
  }

  const privy = await getPrivyClient();
  if (!privy?.wallets) {
    const err = new Error("Privy SDK client is missing wallets() — check @privy-io/node version");
    err.code = "PRIVY_SDK_INCOMPATIBLE";
    throw err;
  }
  const wallet = await privy.wallets().create({ chain_type: t });
  return {
    address: wallet.address,
    providerWalletId: wallet.id,
    providerPolicyId: null,
    chainType: t,
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

async function requestDevnetAirdrop(address, sol = 1) {
  requireDevnet("Devnet airdrop");
  const amount = Number(sol);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 2) {
    const err = new Error("sol must be a positive number up to 2");
    err.code = "SOLANA_BAD_AIRDROP_AMOUNT";
    throw err;
  }
  const conn = getSolanaConnection();
  const pubkey = new PublicKey(address);
  const lamports = Math.round(amount * LAMPORTS_PER_SOL);
  const signature = await conn.requestAirdrop(pubkey, lamports);
  try {
    const latest = await conn.getLatestBlockhash("confirmed");
    await conn.confirmTransaction({ signature, ...latest }, "confirmed");
  } catch {
    // Some public devnet faucets return before confirmation is queryable.
  }
  return { txHash: signature, lamports, sol: lamports / LAMPORTS_PER_SOL };
}

async function buildMemoTransaction(walletAddress, memo) {
  if (!validateSolanaAddress(walletAddress)) {
    const err = new Error("walletAddress must be a valid Solana address");
    err.code = "SOLANA_INVALID_ADDRESS";
    throw err;
  }
  if (!memo || typeof memo !== "string") {
    const err = new Error("memo is required");
    err.code = "SOLANA_MISSING_MEMO";
    throw err;
  }

  const conn = getSolanaConnection();
  const feePayer = new PublicKey(walletAddress);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer,
    recentBlockhash: blockhash,
  }).add(
    new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memo, "utf8"),
    })
  );

  return {
    transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    memo,
    programId: MEMO_PROGRAM_ID.toBase58(),
    recentBlockhash: blockhash,
    lastValidBlockHeight,
  };
}

async function buildTransferTransaction({ fromAddress, toAddress, lamports }) {
  if (!validateSolanaAddress(fromAddress)) {
    const err = new Error("fromAddress must be a valid Solana address");
    err.code = "SOLANA_INVALID_ADDRESS";
    throw err;
  }
  if (!validateSolanaAddress(toAddress)) {
    const err = new Error("toAddress must be a valid Solana address");
    err.code = "SOLANA_INVALID_ADDRESS";
    throw err;
  }
  const amt = Number(lamports);
  if (!Number.isFinite(amt) || amt <= 0) {
    const err = new Error("lamports must be a positive number");
    err.code = "SOLANA_BAD_TRANSFER_AMOUNT";
    throw err;
  }

  const conn = getSolanaConnection();
  const feePayer = new PublicKey(fromAddress);
  const to = new PublicKey(toAddress);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer,
    recentBlockhash: blockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: feePayer,
      toPubkey: to,
      lamports: Math.trunc(amt),
    })
  );

  return {
    transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    programId: SystemProgram.programId.toBase58(),
    recentBlockhash: blockhash,
    lastValidBlockHeight,
    destination: to.toBase58(),
    amount_lamports: Math.trunc(amt),
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
  createWalletForChain,
  getBalance,
  requestDevnetAirdrop,
  buildMemoTransaction,
  buildTransferTransaction,
  signMessage,
  signAndSend,
  getPolicy,
  updatePolicy,
  validateSolanaAddress,
  getSolanaConnection,
  getSolanaCluster,
  isDevnet,
};
