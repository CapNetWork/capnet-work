const { ethers } = require("ethers");
const { pool } = require("../../db");
const { getProvider } = require("../registry");
const { pick, getProviderConfig, upsertProviderConfig, deleteProviderConfig } = require("../store");

const PROVIDER_ID = "erc8004";

const AGENT_IDENTITY_ABI = [
  "function mint(address to, string metadataURI, string agentId) external returns (uint256)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
];

function publicFields() {
  const p = getProvider(PROVIDER_ID);
  return p?.public_fields || [];
}

function ensureConfig() {
  const privateKey = process.env.ERC8004_MINTER_PRIVATE_KEY || "";
  const contractAddress = process.env.ERC8004_CONTRACT_ADDRESS || "";
  const rpcUrl = process.env.ERC8004_RPC_URL || "";
  const chain = process.env.ERC8004_CHAIN || "base";
  const chainId = Number(process.env.ERC8004_CHAIN_ID || 8453);

  if (!privateKey.trim()) {
    const err = new Error("ERC8004_MINTER_PRIVATE_KEY is not configured");
    err.code = "ERC8004_NOT_CONFIGURED";
    throw err;
  }
  if (!contractAddress.trim()) {
    const err = new Error("ERC8004_CONTRACT_ADDRESS is not configured");
    err.code = "ERC8004_NOT_CONFIGURED";
    throw err;
  }
  if (!rpcUrl.trim()) {
    const err = new Error("ERC8004_RPC_URL is not configured");
    err.code = "ERC8004_NOT_CONFIGURED";
    throw err;
  }
  return {
    privateKey: privateKey.trim(),
    contractAddress: contractAddress.trim(),
    rpcUrl: rpcUrl.trim(),
    chain: chain.trim(),
    chainId,
  };
}

function normalizeAddress(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return ethers.getAddress(value.trim());
  } catch {
    return null;
  }
}

function asTokenId(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
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

function buildMetadataPayload(agent) {
  return {
    name: agent.name || `Agent ${agent.id}`,
    description: agent.description || "Clickr agent profile",
    image: agent.avatar_url || null,
    attributes: [
      { trait_type: "domain", value: agent.domain || "general" },
      { trait_type: "platform", value: "clickr" },
    ],
  };
}

function buildMetadataUri(payload) {
  const base = process.env.ERC8004_METADATA_BASE_URL;
  if (base && base.trim()) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${base.trim().replace(/\/$/, "")}/${encoded}.json`;
  }
  const encoded = encodeURIComponent(JSON.stringify(payload));
  return `data:application/json;utf8,${encoded}`;
}

function createContractClient() {
  const cfg = ensureConfig();
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl, cfg.chainId);
  const wallet = new ethers.Wallet(cfg.privateKey, provider);
  const contract = new ethers.Contract(cfg.contractAddress, AGENT_IDENTITY_ABI, wallet);
  return { cfg, contract, provider, wallet };
}


/**
 * ERC-8021 Builder Code suffix for relayed mint txs (Base.dev attribution).
 * Prefer BASE_BUILDER_DATA_SUFFIX (raw 0x hex) when set; else BASE_BUILDER_CODE + ox/erc8021.
 */
function resolveBuilderDataSuffix() {
  const raw = (process.env.BASE_BUILDER_DATA_SUFFIX || "").trim();
  if (raw) {
    const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
    if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
      const err = new Error(
        "BASE_BUILDER_DATA_SUFFIX must be even-length hex (optional 0x prefix)"
      );
      err.code = "ERC8004_BUILDER_SUFFIX_INVALID";
      throw err;
    }
    return `0x${hex}`;
  }
  const code = (process.env.BASE_BUILDER_CODE || "").trim();
  if (!code) return null;
  const { Attribution } = require("ox/erc8021");
  return Attribution.toDataSuffix({ codes: [code] });
}

function configToPublic(cfg) {
  return pick(cfg, publicFields());
}

function shouldRefreshVerification(cfg) {
  const everyMs = Number(process.env.ERC8004_VERIFY_EVERY_MS || 300000);
  if (!cfg?.last_verified_at) return true;
  const ts = Date.parse(cfg.last_verified_at);
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts >= everyMs;
}

async function getIntegrationStatus(agentId) {
  let cfg = await getProviderConfig(agentId, PROVIDER_ID);
  if (!cfg?.token_id) {
    return { connected: false, provider: PROVIDER_ID };
  }

  if (shouldRefreshVerification(cfg) && cfg.owner_wallet) {
    try {
      const { contract } = createContractClient();
      const chainOwnerRaw = await contract.ownerOf(cfg.token_id);
      const chainOwner = normalizeAddress(chainOwnerRaw);
      const expectedOwner = normalizeAddress(cfg.owner_wallet);
      const verified = Boolean(chainOwner && expectedOwner && chainOwner === expectedOwner);
      cfg = await upsertProviderConfig(agentId, PROVIDER_ID, {
        verification_status: verified ? "verified" : "mismatch",
        chain_owner_wallet: chainOwner,
        last_verified_at: new Date().toISOString(),
      });
    } catch {
      cfg = await upsertProviderConfig(agentId, PROVIDER_ID, {
        verification_status: "unavailable",
        last_verified_at: new Date().toISOString(),
      });
    }
  }

  return {
    connected: true,
    provider: PROVIDER_ID,
    config: configToPublic(cfg),
  };
}

async function connect(agentId, input = {}) {
  const ownerWallet = normalizeAddress(input.owner_wallet);
  if (!ownerWallet) {
    const err = new Error("owner_wallet is required and must be a valid EVM address");
    err.code = "ERC8004_OWNER_REQUIRED";
    throw err;
  }

  const agent = await loadAgent(agentId);
  if (!agent) {
    const err = new Error("Agent not found");
    err.code = "ERC8004_AGENT_NOT_FOUND";
    throw err;
  }

  const metadataPayload = buildMetadataPayload(agent);
  const metadataUri = buildMetadataUri(metadataPayload);
  const { cfg, contract, wallet } = createContractClient();

  const populated = await contract.mint.populateTransaction(
    ownerWallet,
    metadataUri,
    String(agentId)
  );
  let data = populated.data;
  const suffix = resolveBuilderDataSuffix();
  if (suffix) {
    data = ethers.concat([data, suffix]);
  }
  const tx = await wallet.sendTransaction({
    to: cfg.contractAddress,
    data,
    chainId: cfg.chainId,
  });
  const receipt = await tx.wait();
  const parsed = receipt?.logs
    ?.map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((log) => log && log.name === "AgentIdentityMinted");

  const tokenId = asTokenId(parsed?.args?.tokenId);
  if (!tokenId) {
    const err = new Error("Mint succeeded but tokenId could not be resolved from logs");
    err.code = "ERC8004_TOKEN_RESOLVE_FAILED";
    throw err;
  }

  const saved = await upsertProviderConfig(agentId, PROVIDER_ID, {
    token_id: tokenId,
    contract_address: cfg.contractAddress,
    chain: cfg.chain,
    chain_id: cfg.chainId,
    owner_wallet: ownerWallet,
    metadata_uri: metadataUri,
    tx_hash: tx.hash,
    minted_at: new Date().toISOString(),
    verification_status: "unverified",
    last_verified_at: null,
  });

  return {
    ok: true,
    provider: PROVIDER_ID,
    token_id: tokenId,
    contract_address: cfg.contractAddress,
    chain: cfg.chain,
    owner_wallet: ownerWallet,
    tx_hash: tx.hash,
    config: configToPublic(saved),
  };
}

async function verify(agentId) {
  const status = await getIntegrationStatus(agentId);
  if (!status.connected) {
    const err = new Error("ERC-8004 identity is not minted for this agent");
    err.code = "ERC8004_NOT_MINTED";
    throw err;
  }
  const cfg = status.config;
  const tokenId = cfg.token_id;
  const expectedOwner = normalizeAddress(cfg.owner_wallet);
  if (!expectedOwner) {
    const err = new Error("Stored owner_wallet is invalid");
    err.code = "ERC8004_INVALID_OWNER";
    throw err;
  }

  const { contract } = createContractClient();
  const chainOwnerRaw = await contract.ownerOf(tokenId);
  const chainOwner = normalizeAddress(chainOwnerRaw);
  const verified = Boolean(chainOwner && chainOwner === expectedOwner);

  const saved = await upsertProviderConfig(agentId, PROVIDER_ID, {
    verification_status: verified ? "verified" : "mismatch",
    chain_owner_wallet: chainOwner,
    last_verified_at: new Date().toISOString(),
  });

  return {
    ok: true,
    provider: PROVIDER_ID,
    verified,
    token_id: tokenId,
    owner_wallet: expectedOwner,
    chain_owner_wallet: chainOwner,
    config: configToPublic(saved),
  };
}

async function disconnect(agentId) {
  const removed = await deleteProviderConfig(agentId, PROVIDER_ID);
  return { ok: true, provider: PROVIDER_ID, removed };
}

function forbidDirectConfigPut() {
  return true;
}

function readConnectInput(body) {
  if (!body || typeof body !== "object") return {};
  return { owner_wallet: body.owner_wallet };
}

function mapConnectError(err) {
  if (!err) return null;
  if (err.code === "ERC8004_OWNER_REQUIRED") return { status: 400, error: err.message };
  if (err.code === "ERC8004_AGENT_NOT_FOUND") return { status: 404, error: err.message };
  if (err.code === "ERC8004_NOT_CONFIGURED") return { status: 503, error: err.message };
  if (err.code === "ERC8004_TOKEN_RESOLVE_FAILED") return { status: 502, error: err.message };
  if (err.code === "ERC8004_BUILDER_SUFFIX_INVALID") return { status: 500, error: err.message };
  return null;
}

module.exports = {
  PROVIDER_ID,
  getIntegrationStatus,
  connect,
  verify,
  disconnect,
  forbidDirectConfigPut,
  readConnectInput,
  mapConnectError,
};
