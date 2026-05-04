/**
 * Agent-signed prediction intent: analyze market → thesis post → Privy memo (optional) → signed_positions.
 * MVP: synchronous, decidePosition() stub in-process, no OpenClaw HTTP.
 */
const crypto = require("crypto");
const { randomUUID } = require("crypto");
const { pool } = require("../db");
const solanaMemoAnchor = require("./solana-memo-anchor");
const privyDriver = require("../lib/drivers/privy");

function sha256Utf8(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

function decidePosition(_market, _threadPosts) {
  return {
    side: "YES",
    confidence: 75,
    rationale:
      "Demo rationale: stub decision favors YES for hackathon MVP. Replace decidePosition() with real reasoning when ready.",
  };
}

function buildCanonicalMessage({ agentId, marketId, side, confidence, timestampIso, nonce }) {
  return [
    "Clickr Signed Prediction Intent",
    `Agent: ${agentId}`,
    `Market: ${marketId}`,
    `Side: ${side}`,
    `Confidence: ${confidence}`,
    `Timestamp: ${timestampIso}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

async function loadPrivySolanaWallet(agentId) {
  const r = await pool.query(
    `SELECT * FROM agent_wallets
     WHERE agent_id = $1 AND chain_type = 'solana' AND custody_type = 'privy'
     ORDER BY linked_at DESC NULLS LAST, id DESC
     LIMIT 1`,
    [agentId]
  );
  if (r.rows.length === 0) {
    const e = new Error(
      "Agent has no Privy Solana wallet. Connect one via POST /integrations/privy_wallet/connect first."
    );
    e.status = 400;
    throw e;
  }
  return r.rows[0];
}

async function analyzeAndPosition({ agentId, marketId, anchor, authMethod }) {
  const c = await pool.query(
    `SELECT id, symbol, name, mint_address FROM token_contracts WHERE id = $1`,
    [marketId]
  );
  if (c.rows.length === 0) {
    const e = new Error("Contract not found");
    e.status = 404;
    throw e;
  }
  const market = c.rows[0];

  const posts = await pool.query(
    `SELECT p.id, p.content, p.created_at
       FROM post_contract_refs pcr
       JOIN posts p ON p.id = pcr.post_id
      WHERE pcr.contract_id = $1
      ORDER BY p.created_at DESC
      LIMIT 30`,
    [marketId]
  );

  const decision = decidePosition(market, posts.rows);
  const side = decision.side === "NO" ? "NO" : "YES";
  let confidence = parseInt(decision.confidence, 10);
  if (!Number.isFinite(confidence)) confidence = 75;
  confidence = Math.min(100, Math.max(0, confidence));

  let thesis = String(decision.rationale || "Thesis").trim();
  if (thesis.length > 500) thesis = `${thesis.slice(0, 497)}...`;

  const nonce = randomUUID();
  const timestampIso = new Date().toISOString();
  const canonicalMessage = buildCanonicalMessage({
    agentId,
    marketId,
    side,
    confidence,
    timestampIso,
    nonce,
  });
  const messageHash = sha256Utf8(canonicalMessage);

  const postIns = await pool.query(
    `INSERT INTO posts (agent_id, content, post_type)
     VALUES ($1, $2, 'post')
     RETURNING id, agent_id, content, created_at`,
    [agentId, thesis]
  );
  const thesisPost = postIns.rows[0];

  await pool.query(
    `INSERT INTO post_contract_refs (post_id, contract_id, kind)
     VALUES ($1, $2, 'primary')
     ON CONFLICT (post_id, contract_id) DO NOTHING`,
    [thesisPost.id, marketId]
  );

  const walletRow = await loadPrivySolanaWallet(agentId);
  const signerPubkey = walletRow.wallet_address;

  let walletTxId = null;
  let memoTxHash = null;

  if (anchor) {
    if (!privyDriver.isDevnet()) {
      await pool.query(`DELETE FROM posts WHERE id = $1`, [thesisPost.id]);
      const e = new Error("Anchoring requires Solana devnet (set SOLANA_CLUSTER=devnet and devnet Privy wallet).");
      e.status = 400;
      throw e;
    }
    try {
      const memoRes = await solanaMemoAnchor.anchorPredictionPositionMemo({
        agentId,
        messageHash,
        walletAddress: signerPubkey,
        walletRow,
        authMethod: authMethod || "session",
      });
      walletTxId = memoRes.wallet_tx_id || null;
      memoTxHash = memoRes.tx_hash || null;
    } catch (err) {
      await pool.query(`DELETE FROM posts WHERE id = $1`, [thesisPost.id]);
      throw err;
    }
  }

  const posIns = await pool.query(
    `INSERT INTO signed_positions (
        agent_id, market_id, side, confidence, thesis_post_id,
        canonical_message, message_hash, signer_pubkey, signature,
        wallet_tx_id, memo_tx_hash, anchor_chain
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10, 'solana-devnet')
      RETURNING id, side, confidence, signer_pubkey, memo_tx_hash, anchor_chain`,
    [agentId, marketId, side, confidence, thesisPost.id, canonicalMessage, messageHash, signerPubkey, walletTxId, memoTxHash]
  );
  const row = posIns.rows[0];

  return {
    post: {
      id: thesisPost.id,
      content: thesisPost.content,
      agent_id: thesisPost.agent_id,
    },
    position: {
      id: row.id,
      side: row.side,
      confidence: row.confidence,
      signer_pubkey: row.signer_pubkey,
      memo_tx_hash: row.memo_tx_hash,
      anchor_chain: row.anchor_chain,
    },
  };
}

module.exports = {
  analyzeAndPosition,
  decidePosition,
  buildCanonicalMessage,
};
