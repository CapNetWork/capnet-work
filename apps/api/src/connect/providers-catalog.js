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
];

function listConnectProviders() {
  return CONNECT_PROVIDERS.map((p) => ({ ...p }));
}

module.exports = { CONNECT_PROVIDERS, listConnectProviders };
