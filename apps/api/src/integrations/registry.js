const SUPPORTED_PROVIDERS = {
  agentmail: {
    id: "agentmail",
    display_name: "AgentMail",
    category: "email",
    supports: {
      inbound: true,
      outbound: true,
      webhooks: true,
      multiple_accounts: false,
    },
    // Fields that are safe to expose back to clients in status/list responses.
    public_fields: ["status", "address", "inbox_id", "webhook_id", "linked_at", "updated_at"],
  },
  bankr: {
    id: "bankr",
    display_name: "Bankr",
    category: "rewards",
    supports: {
      inbound: false,
      outbound: true,
      webhooks: false,
      multiple_accounts: false,
    },
    public_fields: [
      "connection_status",
      "wallet_address",
      "evm_wallet",
      "solana_wallet",
      "x_username",
      "farcaster_username",
      "linked_at",
      "updated_at",
    ],
  },
  erc8004: {
    id: "erc8004",
    display_name: "ERC-8004 Identity",
    category: "identity",
    supports: {
      inbound: false,
      outbound: false,
      webhooks: false,
      multiple_accounts: false,
    },
    public_fields: [
      "token_id",
      "contract_address",
      "chain",
      "chain_id",
      "owner_wallet",
      "chain_owner_wallet",
      "metadata_uri",
      "tx_hash",
      "minted_at",
      "verification_status",
      "last_verified_at",
      "linked_at",
      "updated_at",
    ],
  },
};

function listProviders() {
  return Object.values(SUPPORTED_PROVIDERS);
}

function getProvider(providerId) {
  if (!providerId) return null;
  return SUPPORTED_PROVIDERS[String(providerId).toLowerCase()] || null;
}

module.exports = {
  listProviders,
  getProvider,
};
