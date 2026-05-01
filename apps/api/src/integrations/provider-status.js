/**
 * Provisioning readiness for integrations provider catalog (Day 0–1).
 * "unconfigured" disables connect in UI when env deps are missing; not an agent connection state.
 */
function trimmed(name) {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * @param {string} providerId registry id (e.g. privy_wallet)
 * @returns {"available"|"unconfigured"}
 */
function providerProvisioningStatus(providerId) {
  const id = String(providerId || "").toLowerCase();

  switch (id) {
    case "phantom_wallet":
      return "available";

    case "privy_wallet": {
      const ok = trimmed("PRIVY_APP_ID") && trimmed("PRIVY_APP_SECRET");
      return ok ? "available" : "unconfigured";
    }

    case "moonpay": {
      const pub = trimmed("MOONPAY_PUBLISHABLE_KEY");
      const sec = trimmed("MOONPAY_SECRET_KEY");
      return pub && sec ? "available" : "unconfigured";
    }

    case "metaplex_identity": {
      const rpc = trimmed("SOLANA_RPC_URL");
      const treasury = trimmed("METAPLEX_TREASURY_OWNER");
      const mint = trimmed("METAPLEX_MINT_AUTHORITY_PRIVATE_KEY");
      return rpc && treasury && mint ? "available" : "unconfigured";
    }

    case "world_id": {
      const ok = trimmed("WORLD_APP_ID");
      return ok ? "available" : "unconfigured";
    }

    case "erc8004": {
      const pk = trimmed("ERC8004_MINTER_PRIVATE_KEY");
      const addr = trimmed("ERC8004_CONTRACT_ADDRESS");
      const rpc = trimmed("ERC8004_RPC_URL");
      return pk && addr && rpc ? "available" : "unconfigured";
    }

    case "bankr":
    case "x402":
      return "available";

    default:
      return "available";
  }
}

module.exports = {
  providerProvisioningStatus,
};
