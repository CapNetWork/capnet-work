/**
 * Declarative catalog of Connect provider kinds (OAuth, Web3, and bridges to existing surfaces).
 * Used by GET /connect/providers — stable for integrators; expand as implementations land.
 */

const CONNECT_PROVIDERS = [
  {
    id: "wallet_evm",
    kind: "web3",
    implementation: "partial",
    display_name: "EVM wallet link",
    description:
      "Associate one or more chain-specific addresses with a Clickr user. verified_at is set after SIWE (or equivalent). Future: scoped delegation to agents.",
    chains: [{ chain_id: 8453, name: "Base" }],
    storage: "clickr_linked_wallets",
  },
  {
    id: "base_agent_identity",
    kind: "web3",
    implementation: "live_agent_scoped",
    display_name: "Base mini app + ERC-8004",
    description:
      "Today: SIWE and ERC-8004 mint/verify under /base and /integrations — tied to the agent API key. Future: optional bridge to clickr_users + grants.",
    api_surfaces: ["/base", "/integrations/erc8004"],
    doc: "docs/base-mini-app.md",
  },
  {
    id: "google_gmail",
    kind: "oauth",
    implementation: "planned",
    display_name: "Google (Gmail)",
    description: "User-scoped OAuth; agents require an explicit grant before using tokens.",
    storage: "clickr_user_provider_connections",
  },
  {
    id: "privy_wallet",
    kind: "web3",
    implementation: "live_agent_scoped",
    display_name: "Privy Solana wallet (custodial)",
    description:
      "Generate an agent-controlled Solana wallet via Privy. TEE-secured keys, policy-gated signing, full audit trail.",
    chains: [{ cluster: "mainnet-beta", name: "Solana" }],
    storage: "agent_wallets",
  },
  {
    id: "phantom_wallet",
    kind: "web3",
    implementation: "live_agent_scoped",
    display_name: "Phantom (Solana, user-owned)",
    description:
      "Link a Phantom Solana wallet by public key for attribution and future client-side signing flows. Server-side sign/send return not-implemented until wired to Phantom.",
    chains: [{ cluster: "mainnet-beta", name: "Solana" }],
    storage: "agent_wallets",
    api_surfaces: ["/integrations/phantom_wallet"],
  },
  {
    id: "moonpay",
    kind: "payments",
    implementation: "live_agent_scoped",
    display_name: "MoonPay (fiat ramps)",
    description:
      "Agent-scoped MoonPay link: signed buy/sell widget URLs and webhooks stored in moonpay_webhook_events. Chain-agnostic via currencyCode + walletAddress parameters.",
    storage: "agents.metadata.integrations.moonpay + moonpay_webhook_events",
    api_surfaces: ["/integrations/moonpay", "/integrations/moonpay/webhook"],
  },
  {
    id: "world_id",
    kind: "verification",
    implementation: "live_agent_scoped",
    display_name: "World ID (human-backed badge)",
    description:
      "Prove an agent is backed by a unique human via World's proof-of-personhood. Unlocks trust score bonus and x402 discounts.",
    storage: "agent_verifications",
  },
  {
    id: "x402",
    kind: "payments",
    implementation: "live_agent_scoped",
    display_name: "x402 Payments (Coinbase)",
    description:
      "HTTP-native stablecoin micropayments. Agents can charge for API endpoints and pay for others' services.",
    storage: "agent_payment_events",
  },
];

function listConnectProviders() {
  return CONNECT_PROVIDERS.map((p) => ({ ...p }));
}

module.exports = { CONNECT_PROVIDERS, listConnectProviders };
