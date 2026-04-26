const crypto = require("crypto");
const privyDriver = require("../lib/drivers/privy");
const privyWallet = require("../integrations/providers/privy-wallet");

function requireDevnet() {
  if (privyDriver.isDevnet()) return;
  const err = new Error("Solana Memo anchoring is only available on devnet");
  err.code = "SOLANA_DEVNET_REQUIRED";
  err.status = 400;
  throw err;
}

function sha256(input) {
  return crypto.createHash("sha256").update(String(input || ""), "utf8").digest("hex");
}

function walletAddressFrom(input) {
  return input?.walletAddress || input?.walletRow?.wallet_address || input?.wallet?.wallet_address || null;
}

function walletRowFrom(input) {
  return input?.walletRow || input?.wallet || null;
}

async function sendMemo({ agentId, walletRow, walletAddress, memo, authMethod = "session", programLabel = "spl-memo" }) {
  requireDevnet();
  if (!agentId) {
    const err = new Error("agentId required");
    err.status = 400;
    throw err;
  }
  const row = walletRowFrom({ walletRow });
  if (!row?.provider_wallet_id) {
    const err = new Error("Privy wallet row with provider_wallet_id is required");
    err.status = 400;
    throw err;
  }
  const address = walletAddress || row.wallet_address;
  const built = await privyDriver.buildMemoTransaction(address, memo);
  const result = await privyWallet.send(
    agentId,
    row,
    {
      transaction: built.transaction,
      program_id: built.programId || programLabel,
      destination: built.programId || programLabel,
    },
    authMethod
  );

  return {
    ok: true,
    tx_hash: result.tx_hash,
    wallet_tx_id: result.wallet_tx_id,
    status: result.status,
    wallet_address: address,
    solana_cluster: privyDriver.getSolanaCluster(),
    memo,
    memo_hash: sha256(memo),
    program_id: built.programId,
  };
}

async function anchorPostMemo({ agentId, postId, content, walletAddress, walletRow, authMethod = "session" }) {
  const address = walletAddressFrom({ walletAddress, walletRow });
  const contentHash = sha256(content);
  const memo = `clickr:post:${postId}:${contentHash}`;
  const result = await sendMemo({
    agentId,
    walletRow,
    walletAddress: address,
    memo,
    authMethod,
    programLabel: "clickr-post-memo",
  });
  return {
    ...result,
    anchor_type: "post",
    post_id: postId,
    content_hash: contentHash,
  };
}

async function anchorIntentMemo({ agentId, intentId, side, amount, walletAddress, walletRow, authMethod = "session" }) {
  const address = walletAddressFrom({ walletAddress, walletRow });
  const memo = `clickr:intent:${intentId}:${side}:${amount}`;
  const result = await sendMemo({
    agentId,
    walletRow,
    walletAddress: address,
    memo,
    authMethod,
    programLabel: "clickr-intent-memo",
  });
  return {
    ...result,
    anchor_type: "intent",
    intent_id: intentId,
    side,
    amount,
  };
}

async function anchorTestMemo({ agentId, walletAddress, walletRow, message, authMethod = "session" }) {
  const address = walletAddressFrom({ walletAddress, walletRow });
  const memo = `clickr:test:${sha256(message || Date.now()).slice(0, 32)}`;
  return sendMemo({
    agentId,
    walletRow,
    walletAddress: address,
    memo,
    authMethod,
    programLabel: "clickr-test-memo",
  });
}

module.exports = {
  anchorPostMemo,
  anchorIntentMemo,
  anchorTestMemo,
};
