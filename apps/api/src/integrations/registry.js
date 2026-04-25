const SUPPORTED_PROVIDERS = {
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
  privy_wallet: {
    id: "privy_wallet",
    display_name: "Privy Wallet",
    category: "wallet",
    supports: {
      inbound: false,
      outbound: true,
      webhooks: false,
      multiple_accounts: false,
    },
    public_fields: [
      "wallet_address",
      "chain_type",
      "custody_type",
      "balance_sol",
      "policy_summary",
      "linked_at",
    ],
  },
  phantom_wallet: {
    id: "phantom_wallet",
    display_name: "Phantom (Solana)",
    category: "wallet",
    supports: {
      inbound: false,
      outbound: true,
      webhooks: false,
      multiple_accounts: false,
    },
    public_fields: ["wallet_address", "chain_type", "custody_type", "linked_at"],
  },
  moonpay: {
    id: "moonpay",
    display_name: "MoonPay",
    category: "payments",
    supports: {
      inbound: true,
      outbound: true,
      webhooks: true,
      multiple_accounts: false,
    },
    public_fields: [
      "connection_status",
      "external_customer_id",
      "default_currency_code",
      "default_wallet_address",
      "environment",
      "last_webhook_at",
      "last_webhook_type",
      "linked_at",
    ],
  },
  world_id: {
    id: "world_id",
    display_name: "World ID",
    category: "verification",
    supports: {
      inbound: false,
      outbound: false,
      webhooks: false,
      multiple_accounts: false,
    },
    public_fields: ["verified", "verification_level", "verified_at"],
  },
  x402: {
    id: "x402",
    display_name: "x402 Payments",
    category: "payments",
    supports: {
      inbound: true,
      outbound: true,
      webhooks: false,
      multiple_accounts: false,
    },
    public_fields: ["total_earned", "total_spent", "payment_wallet", "linked_at"],
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
