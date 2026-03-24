/**
 * Bankr rewards provider: secrets live in agent_bankr_accounts (encrypted API key).
 * Public snapshot is mirrored to agents.metadata.integrations.bankr for the generic
 * /integrations API and multi-provider UX.
 */
const { pool } = require("../../db");
const { getMe } = require("../../services/bankr-client");
const { encryptUtf8 } = require("../../lib/secret-crypto");
const { pick, upsertProviderConfig, deleteProviderConfig } = require("../store");
const { getProvider } = require("../registry");

const PROVIDER_ID = "bankr";

function publicFields() {
  const p = getProvider(PROVIDER_ID);
  return p?.public_fields || [];
}

function rowToPublic(row) {
  return pick(
    {
      connection_status: row.connection_status,
      wallet_address: row.wallet_address,
      evm_wallet: row.evm_wallet,
      solana_wallet: row.solana_wallet,
      x_username: row.x_username,
      farcaster_username: row.farcaster_username,
      updated_at: row.updated_at,
    },
    publicFields()
  );
}

/**
 * @returns {Promise<{ connected: boolean, provider: string, config?: object }>}
 */
async function getIntegrationStatus(agentId) {
  const r = await pool.query(
    `SELECT connection_status, wallet_address, evm_wallet, solana_wallet,
            x_username, farcaster_username, updated_at
     FROM agent_bankr_accounts
     WHERE agent_id = $1`,
    [agentId]
  );
  if (r.rows.length === 0) {
    return { connected: false, provider: PROVIDER_ID };
  }
  return {
    connected: true,
    provider: PROVIDER_ID,
    config: rowToPublic(r.rows[0]),
  };
}

async function mirrorMetadata(agentId, row) {
  await upsertProviderConfig(agentId, PROVIDER_ID, rowToPublic(row));
}

/**
 * Connect Bankr: validate key with Bankr API, persist encrypted key, mirror public fields.
 * @returns {Promise<object>} Same shape as legacy POST /api/bankr/connect response body.
 */
async function connect(agentId, bankrApiKey) {
  const me = await getMe(bankrApiKey);
  const walletAddress = me.evm_wallet;
  if (!walletAddress) {
    const err = new Error("BANKR_NO_EVM_WALLET");
    err.code = "BANKR_NO_EVM_WALLET";
    throw err;
  }

  const enc = encryptUtf8(bankrApiKey);
  const result = await pool.query(
    `INSERT INTO agent_bankr_accounts (
       agent_id, wallet_address, evm_wallet, solana_wallet, x_username, farcaster_username,
       permissions_json, api_key_encrypted, connection_status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (agent_id) DO UPDATE SET
       wallet_address = EXCLUDED.wallet_address,
       evm_wallet = EXCLUDED.evm_wallet,
       solana_wallet = EXCLUDED.solana_wallet,
       x_username = EXCLUDED.x_username,
       farcaster_username = EXCLUDED.farcaster_username,
       permissions_json = EXCLUDED.permissions_json,
       api_key_encrypted = EXCLUDED.api_key_encrypted,
       connection_status = EXCLUDED.connection_status,
       updated_at = now()
     RETURNING connection_status, wallet_address, evm_wallet, solana_wallet,
               x_username, farcaster_username, updated_at`,
    [
      agentId,
      walletAddress,
      walletAddress,
      me.solana_wallet,
      me.x_username,
      me.farcaster_username,
      JSON.stringify(me.raw || {}),
      enc,
      me.connection_state,
    ]
  );

  const row = result.rows[0];
  await mirrorMetadata(agentId, row);

  return {
    ok: true,
    wallet_address: walletAddress,
    evm_wallet: walletAddress,
    solana_wallet: me.solana_wallet,
    x_username: me.x_username,
    farcaster_username: me.farcaster_username,
    connection_status: me.connection_state,
  };
}

/**
 * Remove Bankr link: deletes encrypted credentials and integration metadata.
 */
async function disconnect(agentId) {
  const del = await pool.query("DELETE FROM agent_bankr_accounts WHERE agent_id = $1", [agentId]);
  const metaRemoved = await deleteProviderConfig(agentId, PROVIDER_ID);
  return {
    ok: true,
    provider: PROVIDER_ID,
    removed: del.rowCount > 0 || metaRemoved,
  };
}

/** Generic PUT /integrations/bankr/config cannot set secrets — use POST /api/bankr/connect */
function forbidDirectConfigPut() {
  return true;
}

module.exports = {
  PROVIDER_ID,
  getIntegrationStatus,
  connect,
  disconnect,
  forbidDirectConfigPut,
};
