const {
  Connection,
  PublicKey,
  VersionedTransaction,
} = require("@solana/web3.js");
const bs58 = require("bs58");
const { pool } = require("../../db");
const { getProvider } = require("../registry");
const { pick, getProviderConfig, upsertProviderConfig } = require("../store");

const PROVIDER_ID = "metaplex_identity";

function publicFields() {
  const p = getProvider(PROVIDER_ID);
  return p?.public_fields || [];
}

function envStr(name, fallback = "") {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : fallback;
}

function config() {
  const network = envStr("METAPLEX_NETWORK", "devnet").toLowerCase();
  const feeAsset = envStr("MINT_FEE_ASSET", "SOL").toUpperCase();
  const feeAmount = envStr("METAPLEX_MINT_FEE_SOL", "0.01");
  const treasuryOwner = envStr("METAPLEX_TREASURY_OWNER", "");
  const rpcUrl = envStr("SOLANA_RPC_URL", network === "devnet" ? "https://api.devnet.solana.com" : "");

  if (!rpcUrl) {
    const err = new Error("SOLANA_RPC_URL is required");
    err.code = "METAPLEX_IDENTITY_NOT_CONFIGURED";
    throw err;
  }
  if (!treasuryOwner) {
    const err = new Error("METAPLEX_TREASURY_OWNER is required");
    err.code = "METAPLEX_IDENTITY_NOT_CONFIGURED";
    throw err;
  }
  if (feeAsset !== "SOL") {
    const err = new Error("Hackathon v1 only supports MINT_FEE_ASSET=SOL");
    err.code = "METAPLEX_IDENTITY_NOT_CONFIGURED";
    throw err;
  }

  return {
    network,
    networkCaip2: `solana:${network}`,
    feeAsset,
    feeAmount,
    treasuryOwner,
    rpcUrl,
    mintAuthorityKey: envStr("METAPLEX_MINT_AUTHORITY_PRIVATE_KEY", ""),
    collectionAddress: envStr("METAPLEX_COLLECTION_ADDRESS", "") || null,
  };
}

function parseSolDecimalToLamports(amountStr) {
  const s = String(amountStr || "").trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    const err = new Error("METAPLEX_MINT_FEE_SOL must be a non-negative decimal string");
    err.code = "METAPLEX_IDENTITY_CONFIG_INVALID";
    throw err;
  }
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(9)).slice(0, 9);
  return (BigInt(whole) * BigInt(1_000_000_000) + BigInt(fracPadded || "0")).toString();
}

function ensureSolanaAddress(value, fieldName) {
  try {
    return new PublicKey(String(value || "").trim());
  } catch {
    const err = new Error(`${fieldName} must be a valid Solana address`);
    err.code = "METAPLEX_IDENTITY_BAD_ADDRESS";
    throw err;
  }
}

function configToPublic(cfg) {
  return pick(cfg, publicFields());
}

async function getIntegrationStatus(agentId) {
  const cfg = await getProviderConfig(agentId, PROVIDER_ID);
  if (!cfg || typeof cfg !== "object") return { connected: false, provider: PROVIDER_ID };

  const meaningful = Object.keys(cfg).filter(
    (k) => !["provider", "linked_at", "updated_at"].includes(k) && cfg[k] != null && cfg[k] !== ""
  );
  if (meaningful.length === 0) return { connected: false, provider: PROVIDER_ID };

  return { connected: true, provider: PROVIDER_ID, config: configToPublic(cfg) };
}

async function quote(agentId) {
  const c = config();
  const lamports = parseSolDecimalToLamports(c.feeAmount);
  return {
    agentId,
    network: c.networkCaip2,
    feeAsset: c.feeAsset,
    feeAmount: c.feeAmount,
    feeAmountLamports: lamports,
    treasuryWallet: c.treasuryOwner,
  };
}

async function txLooksLikeSolFeePayment({ connection, signature, ownerWallet, treasuryWallet, minLamports }) {
  const sig = String(signature || "").trim();
  if (!sig) return { ok: false, error: "fee_tx_signature is required" };

  const status = await connection.getSignatureStatus(sig, { searchTransactionHistory: true });
  const confirmation = status?.value?.confirmationStatus || null;
  if (confirmation !== "finalized") {
    return { ok: false, error: "transaction is not finalized yet" };
  }

  const tx = await connection.getTransaction(sig, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) return { ok: false, error: "transaction not found" };

  const owner = new PublicKey(ownerWallet);
  const treasury = new PublicKey(treasuryWallet);

  const vtx = VersionedTransaction.deserialize(Buffer.from(tx.transaction, "base64"));
  const message = vtx.message;
  const payerKey = message.staticAccountKeys?.[0] || null;
  if (!payerKey || !payerKey.equals(owner)) {
    return { ok: false, error: "fee payer does not match owner wallet" };
  }

  const staticKeys = Array.isArray(message.staticAccountKeys) ? message.staticAccountKeys : [];

  /** @type {PublicKey[]} */
  const accountKeysPk = [...staticKeys];
  const loaded = tx.meta?.loadedAddresses || null;
  if (loaded) {
    const wr = Array.isArray(loaded.writable) ? loaded.writable.map((x) => new PublicKey(x)) : [];
    const ro = Array.isArray(loaded.readonly) ? loaded.readonly.map((x) => new PublicKey(x)) : [];
    accountKeysPk.push(...wr, ...ro);
  }

  const payerIndex = accountKeysPk.findIndex((k) => k.equals(owner));
  if (payerIndex < 0) {
    return { ok: false, error: "fee payer not found in resolved account keys" };
  }

  const treasuryStr = treasury.toBase58();

  const idxTreasury = accountKeysPk.findIndex((k) => k.equals(treasury));
  if (idxTreasury < 0) return { ok: false, error: "treasury wallet not present in resolved account keys for this tx" };

  const preTreasury = BigInt(tx.meta?.preBalances?.[idxTreasury] ?? 0);
  const postTreasury = BigInt(tx.meta?.postBalances?.[idxTreasury] ?? 0);
  const treasuryDelta = postTreasury > preTreasury ? postTreasury - preTreasury : 0n;
  const matched = treasuryDelta > 0n;
  const amountLamports = treasuryDelta;

  if (!matched) return { ok: false, error: "treasury wallet received no SOL in this tx" };
  if (BigInt(amountLamports) < BigInt(minLamports)) return { ok: false, error: "fee amount below minimum" };

  return { ok: true, amountLamports: amountLamports.toString(), slot: tx.slot };
}

function decodeMintAuthoritySecret(key) {
  const raw = String(key || "").trim();
  if (!raw) {
    const err = new Error("METAPLEX_MINT_AUTHORITY_PRIVATE_KEY is required");
    err.code = "METAPLEX_IDENTITY_NOT_CONFIGURED";
    throw err;
  }
  if (raw.startsWith("[")) {
    const arr = JSON.parse(raw);
    return Uint8Array.from(arr);
  }
  // base58 secret key is common
  return bs58.decode(raw);
}

function buildMetadataUri(agent) {
  const payload = {
    name: agent.name || `Agent ${agent.id}`,
    description: agent.description || "Clickr agent profile",
    image: agent.avatar_url || null,
    attributes: [
      { trait_type: "platform", value: "clickr" },
      { trait_type: "agent_id", value: agent.id },
      ...(agent.domain ? [{ trait_type: "domain", value: agent.domain }] : []),
    ],
  };
  const encoded = encodeURIComponent(JSON.stringify(payload));
  return `data:application/json;utf8,${encoded}`;
}

async function loadAgent(agentId) {
  const r = await pool.query(
    `SELECT id, name, domain, avatar_url, description, metadata
     FROM agents
     WHERE id = $1`,
    [agentId]
  );
  return r.rows[0] || null;
}

async function claim({ agentId, ownerWallet, feeTxSignature }) {
  const c = config();
  const owner = ensureSolanaAddress(ownerWallet, "owner_wallet");
  const treasury = ensureSolanaAddress(c.treasuryOwner, "treasuryWallet");
  const minLamports = parseSolDecimalToLamports(c.feeAmount);

  const existing = await getProviderConfig(agentId, PROVIDER_ID);
  if (existing?.verification_status === "verified") {
    const err = new Error("Agent already has verified Metaplex identity");
    err.code = "METAPLEX_IDENTITY_ALREADY_VERIFIED";
    err.status = 409;
    throw err;
  }

  // Insert or reuse a payment row so we can retry minting without re-paying.
  const sig = String(feeTxSignature || "").trim();
  if (!sig) {
    const err = new Error("fee_tx_signature is required");
    err.status = 400;
    throw err;
  }

  const existingBySig = await pool.query(`SELECT * FROM metaplex_identity_payments WHERE fee_tx_signature = $1 LIMIT 1`, [sig]);
  if (existingBySig.rows.length > 0) {
    const row = existingBySig.rows[0];
    if (row.agent_id !== agentId) {
      const err = new Error("This fee transaction was already used for another agent");
      err.code = "METAPLEX_IDENTITY_REPLAY";
      err.status = 409;
      throw err;
    }
  } else {
    try {
      await pool.query(
        `INSERT INTO metaplex_identity_payments (fee_tx_signature, agent_id, owner_wallet, amount_lamports, network, status)
         VALUES ($1, $2, $3, $4, $5, 'pending_payment')`,
        [sig, agentId, owner.toBase58(), "0", c.networkCaip2]
      );
    } catch (e) {
      if (e && e.code === "23505" && String(e.constraint || "").includes("agent_id")) {
        const err = new Error("This agent already has a mint payment record");
        err.status = 409;
        throw err;
      }
      throw e;
    }
  }

  const paymentLatest = await pool.query(`SELECT * FROM metaplex_identity_payments WHERE fee_tx_signature = $1 LIMIT 1`, [sig]);
  const row = paymentLatest.rows[0];

  // Verify fee tx if not yet verified.
  if (row.status === "pending_payment") {
    const connection = new Connection(c.rpcUrl, { commitment: "finalized" });
    const verified = await txLooksLikeSolFeePayment({
      connection,
      signature: sig,
      ownerWallet: owner.toBase58(),
      treasuryWallet: treasury.toBase58(),
      minLamports,
    });
    if (!verified.ok) {
      const err = new Error(verified.error);
      err.status = 400;
      throw err;
    }
    await pool.query(
      `UPDATE metaplex_identity_payments
       SET status = 'payment_verified', amount_lamports = $1, error_message = NULL
       WHERE fee_tx_signature = $2`,
      [verified.amountLamports, sig]
    );
  }

  // Mark minting and attempt mint.
  await pool.query(
    `UPDATE metaplex_identity_payments
     SET status = 'minting', error_message = NULL
     WHERE fee_tx_signature = $1 AND agent_id = $2`,
    [sig, agentId]
  );

  const agent = await loadAgent(agentId);
  if (!agent) {
    const err = new Error("Agent not found");
    err.status = 404;
    throw err;
  }

  const metadataUri = buildMetadataUri(agent);

  try {
    const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
    const { mplCore, create, fetchCollection } = require("@metaplex-foundation/mpl-core");
    const { keypairIdentity, generateSigner, publicKey } = require("@metaplex-foundation/umi");
    const { base58 } = require("@metaplex-foundation/umi/serializers");
    const { createSignerFromKeypair } = require("@metaplex-foundation/umi");

    const umi = createUmi(c.rpcUrl, "finalized").use(mplCore());
    const secret = decodeMintAuthoritySecret(c.mintAuthorityKey);
    const kp = umi.eddsa.createKeypairFromSecretKey(secret);
    const signer = createSignerFromKeypair(umi, kp);
    umi.use(keypairIdentity(signer));

    const assetSigner = generateSigner(umi);
    const ownerPk = publicKey(owner.toBase58());
    let collection = null;
    if (c.collectionAddress) {
      collection = await fetchCollection(umi, publicKey(c.collectionAddress));
    }

    const builder = create(umi, {
      asset: assetSigner,
      owner: ownerPk,
      name: agent.name || `Agent ${agent.id}`,
      uri: metadataUri,
      ...(collection ? { collection } : {}),
    });
    const res = await builder.sendAndConfirm(umi, { confirm: { commitment: "finalized" } });
    const mintSig = base58.deserialize(res.signature)[0];

    const nextCfg = await upsertProviderConfig(agentId, PROVIDER_ID, {
      asset_id: assetSigner.publicKey.toString(),
      collection_address: c.collectionAddress,
      owner_wallet: owner.toBase58(),
      fee_tx_signature: sig,
      mint_tx_signature: mintSig,
      metadata_uri: metadataUri,
      network: c.networkCaip2,
      fee_asset: "SOL",
      fee_amount: c.feeAmount,
      status: "verified",
      verification_status: "verified",
      minted_at: new Date().toISOString(),
    });

    await pool.query(
      `UPDATE metaplex_identity_payments
       SET status = 'verified', error_message = NULL
       WHERE fee_tx_signature = $1 AND agent_id = $2`,
      [sig, agentId]
    );

    return { ok: true, provider: PROVIDER_ID, config: configToPublic(nextCfg) };
  } catch (e) {
    await pool.query(
      `UPDATE metaplex_identity_payments
       SET status = 'failed', error_message = $1
       WHERE fee_tx_signature = $2 AND agent_id = $3`,
      [String(e.message || e).slice(0, 2000), sig, agentId]
    );
    const nextCfg = await upsertProviderConfig(agentId, PROVIDER_ID, {
      owner_wallet: owner.toBase58(),
      fee_tx_signature: sig,
      metadata_uri: metadataUri,
      network: c.networkCaip2,
      fee_asset: "SOL",
      fee_amount: c.feeAmount,
      status: "failed",
      verification_status: "unverified",
      error_message: String(e.message || e).slice(0, 2000),
    });
    return { ok: false, provider: PROVIDER_ID, error: String(e.message || e), config: configToPublic(nextCfg) };
  }
}

function mapConnectError(err) {
  if (!err) return null;
  if (err.code === "METAPLEX_IDENTITY_NOT_CONFIGURED") return { status: 503, error: err.message };
  if (err.code === "METAPLEX_IDENTITY_ALREADY_VERIFIED") return { status: 409, error: err.message };
  if (err.code === "METAPLEX_IDENTITY_BAD_ADDRESS") return { status: 400, error: err.message };
  return null;
}

module.exports = {
  PROVIDER_ID,
  getIntegrationStatus,
  quote,
  claim,
  mapConnectError,
};

