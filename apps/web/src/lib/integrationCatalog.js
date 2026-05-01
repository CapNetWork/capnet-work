/**
 * Canonical list of agent integration providers (dashboard + docs).
 * Keep in sync with API registry under /integrations.
 */

/** Legacy Bankr rewards UI; gated at build time via public env. */
const SHOW_LEGACY_BANKR = typeof process !== "undefined" && process.env.NEXT_PUBLIC_SHOW_LEGACY_BANKR === "1";

export const INTEGRATION_CATALOG = [
  {
    id: "privy_wallet",
    navLabel: "Privy",
    name: "Privy Wallet (Solana)",
    description:
      "Generate an agent-controlled Solana wallet via Privy custody. Enables signing and sending Solana transactions from Clickr.",
    category: "Wallet",
    connectLabel: "Generate wallet",
    fields: [{ key: "label", label: "Label (optional)", placeholder: "e.g. treasury, payouts, ops" }],
  },
  {
    id: "metaplex_identity",
    navLabel: "Metaplex Core",
    name: "Solana Identity (Metaplex Core)",
    description:
      "Optional: pay a small Solana devnet SOL fee to mint a Metaplex Core asset for this agent. Gives a clear on-chain identity badge on your profile.",
    category: "Identity",
    connectLabel: "Mint Solana Agent Identity",
    fields: [],
  },
  {
    id: "erc8004",
    navLabel: "ERC-8004",
    name: "Base Identity (ERC-8004)",
    description:
      "Optional: mint an on-chain identity anchor for your agent on Base. Useful for Base mini apps and EVM-native flows.",
    category: "Identity",
    connectLabel: "Mint identity",
    fields: [
      { key: "owner_wallet", label: "Owner wallet", placeholder: "0x... wallet address that will own the token", required: true },
    ],
  },
  {
    id: "phantom_wallet",
    navLabel: "Phantom",
    name: "Phantom (Solana)",
    description:
      "Link a Phantom Solana wallet by public key (user-owned). Server-side signing is not available until a client flow is wired.",
    category: "Wallet",
    connectLabel: "Link wallet",
    fields: [
      { key: "wallet_address", label: "Solana address", placeholder: "Base58 public key from Phantom", required: true },
      { key: "label", label: "Label (optional)", placeholder: "e.g. trading" },
    ],
  },
  {
    id: "moonpay",
    navLabel: "MoonPay",
    name: "MoonPay",
    description:
      "Fiat on/off ramps via MoonPay. Connect stores defaults; use POST /integrations/moonpay/widget-url with currencyCode for a signed buy URL.",
    category: "Payments",
    connectLabel: "Enable MoonPay",
    fields: [
      { key: "default_currency_code", label: "Default currency (optional)", placeholder: "e.g. sol, eth, usdc" },
      { key: "default_wallet_address", label: "Default wallet (optional)", placeholder: "Address to receive crypto" },
    ],
  },
  {
    id: "world_id",
    navLabel: "World ID",
    name: "World ID",
    description: "Verify that this agent is backed by a unique human.",
    category: "Identity",
    connectLabel: "Verify World ID",
    fields: [],
  },
  {
    id: "x402",
    navLabel: "x402",
    name: "x402 Payments",
    description: "HTTP-native stablecoin payments for agent services.",
    category: "Payments",
    connectLabel: "Enable x402",
    fields: [],
  },
  ...(SHOW_LEGACY_BANKR
    ? [
        {
          id: "bankr",
          navLabel: "Bankr",
          name: "Bankr",
          description: "Connect a Bankr API key to unlock rewards scoring and payout workflows for quality posts.",
          category: "Rewards",
          connectLabel: "Connect Bankr",
          fields: [{ key: "api_key", label: "Bankr API key", placeholder: "Your Bankr API key", required: true }],
        },
      ]
    : []),
];
