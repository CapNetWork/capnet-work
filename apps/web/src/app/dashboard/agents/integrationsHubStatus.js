/** Hub-only: derive sortable status / labels — keep in sync with IntegrationCard semantics. */

export const INTEGRATION_STATUS = {
  CONNECTED: "connected",
  NOT_LINKED: "not_linked",
  PAUSED: "paused",
  UNCONFIGURED: "unconfigured",
};

/** Sort: connected → paused → not_linked → unconfigured */
export const STATUS_SORT_RANK = {
  [INTEGRATION_STATUS.CONNECTED]: 0,
  [INTEGRATION_STATUS.PAUSED]: 1,
  [INTEGRATION_STATUS.NOT_LINKED]: 2,
  [INTEGRATION_STATUS.UNCONFIGURED]: 3,
};

/** Canonical chip copy (never per-integration custom strings). */
export const STATUS_CHIP_LABEL = {
  [INTEGRATION_STATUS.CONNECTED]: "Connected",
  [INTEGRATION_STATUS.NOT_LINKED]: "Not linked",
  [INTEGRATION_STATUS.PAUSED]: "Paused",
  [INTEGRATION_STATUS.UNCONFIGURED]: "Unavailable",
};

export const COLUMN_ORDER = ["Wallet", "Payments", "Identity", "Rewards"];

/** UI-only plural / display names for COLUMN_ORDER keys */
export function columnDisplayName(categoryKey) {
  const map = {
    Wallet: "Wallets",
    Payments: "Payments",
    Identity: "Identity",
    Rewards: "Rewards",
  };
  return map[categoryKey] ?? categoryKey;
}

/**
 * @param {string} integrationId
 * @param {Record<string, object>|undefined} agentMeta
 * @param {{ status?: string }|null|undefined} providerRow
 * @returns {keyof typeof INTEGRATION_STATUS}
 */
export function deriveIntegrationStatus(integrationId, agentMeta, providerRow) {
  if (providerRow?.status === "unconfigured") {
    return INTEGRATION_STATUS.UNCONFIGURED;
  }

  const meta = agentMeta?.[integrationId];
  const connected = meta?.connected === true;

  if (integrationId === "privy_wallet") {
    if (!connected) return INTEGRATION_STATUS.NOT_LINKED;
    if (meta?.is_paused === true) return INTEGRATION_STATUS.PAUSED;
    return INTEGRATION_STATUS.CONNECTED;
  }

  if (integrationId === "world_id") {
    const ok = meta?.verified === true || connected;
    return ok ? INTEGRATION_STATUS.CONNECTED : INTEGRATION_STATUS.NOT_LINKED;
  }

  if (integrationId === "metaplex_identity") {
    const verifiedMint = meta?.verification_status === "verified";
    return verifiedMint ? INTEGRATION_STATUS.CONNECTED : INTEGRATION_STATUS.NOT_LINKED;
  }

  if (integrationId === "erc8004") {
    if (meta?.verification_status === "verified" || connected) return INTEGRATION_STATUS.CONNECTED;
    return INTEGRATION_STATUS.NOT_LINKED;
  }

  if (connected) return INTEGRATION_STATUS.CONNECTED;
  return INTEGRATION_STATUS.NOT_LINKED;
}

export function statusChipClassName(status) {
  switch (status) {
    case INTEGRATION_STATUS.CONNECTED:
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case INTEGRATION_STATUS.PAUSED:
      return "border-amber-500/40 bg-amber-500/10 text-amber-300";
    case INTEGRATION_STATUS.UNCONFIGURED:
      return "border-rose-500/45 bg-rose-500/10 text-rose-200";
    case INTEGRATION_STATUS.NOT_LINKED:
    default:
      return "border-zinc-600 bg-zinc-800/40 text-zinc-400";
  }
}

export function countsActiveConfigured(statusesList) {
  let active = 0;
  let configured = 0;
  for (const s of statusesList) {
    if (s === INTEGRATION_STATUS.CONNECTED) {
      active += 1;
      configured += 1;
    } else if (s === INTEGRATION_STATUS.PAUSED) {
      configured += 1;
    }
  }
  return { active, configured };
}

export function sortIntegrationItems(items, agentMeta, getProviderRow) {
  return [...items].sort((a, b) => {
    const idA = a.integration?.id;
    const idB = b.integration?.id;
    const sA = deriveIntegrationStatus(idA, agentMeta, getProviderRow(a));
    const sB = deriveIntegrationStatus(idB, agentMeta, getProviderRow(b));
    const d = STATUS_SORT_RANK[sA] - STATUS_SORT_RANK[sB];
    if (d !== 0) return d;
    return (a.integration?.navLabel || a.integration?.name || idA || "").localeCompare(
      b.integration?.navLabel || b.integration?.name || idB || ""
    );
  });
}
