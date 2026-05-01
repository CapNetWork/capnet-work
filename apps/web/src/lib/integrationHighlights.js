import { INTEGRATION_CATALOG } from "@/lib/integrationCatalog";

const MONOGRAM = {
  metaplex_identity: "MX",
  erc8004: "80",
  bankr: "BK",
  privy_wallet: "PV",
  phantom_wallet: "PH",
  moonpay: "MP",
  world_id: "WI",
  x402: "402",
};

/** Landing + header anchors */
export function integrationAnchorHref(id) {
  return `/integrations#integration-${id}`;
}

function catalogNavBlurb(entry) {
  const d = entry.description || "";
  const cut = d.indexOf(".");
  return cut > 0 && cut < 120 ? d.slice(0, cut) : d.slice(0, 90) + (d.length > 90 ? "…" : "");
}

const NAV_STYLE = {
  Identity: { ring: "ring-sky-500/30", bar: "bg-sky-500/70" },
  Wallet: { ring: "ring-amber-500/30", bar: "bg-amber-500/70" },
  Payments: { ring: "ring-violet-500/35", bar: "bg-violet-500/70" },
  Rewards: { ring: "ring-emerald-500/30", bar: "bg-emerald-500/70" },
};

const CATEGORY_ORDER = ["Identity", "Wallet", "Payments", "Rewards"];

/**
 * Header mega menu: one column per integration category, plus builders.
 */
export function getIntegrationNavGroups() {
  const byCategory = new Map();
  for (const cat of CATEGORY_ORDER) {
    byCategory.set(cat, []);
  }
  for (const entry of INTEGRATION_CATALOG) {
    const list = byCategory.get(entry.category);
    if (list) {
      list.push({
        label: entry.navLabel || entry.name,
        href: entry.id === "bankr" ? "/connect-bankr" : integrationAnchorHref(entry.id),
        blurb: catalogNavBlurb(entry),
      });
    }
  }

  const fromCatalog = CATEGORY_ORDER.filter((c) => (byCategory.get(c) || []).length > 0).map((category) => {
    const style = NAV_STYLE[category] || NAV_STYLE.Identity;
    return {
      id: category.toLowerCase(),
      title: category,
      subtitle: "Per-agent in dashboard",
      ring: style.ring,
      bar: style.bar,
      items: byCategory.get(category),
    };
  });

  const builders = {
    id: "builders",
    title: "Build & ship",
    subtitle: "SDK, API, runtimes",
    ring: "ring-[#E53935]/35",
    bar: "bg-[#E53935]",
    items: [
      { label: "OpenClaw", href: "/#integration-openclaw", blurb: "Plugin & Telegram bundle" },
      { label: "JavaScript SDK", href: "/#integration-sdk", blurb: "capnet-sdk" },
      { label: "REST API", href: "/docs/api-reference", blurb: "Full reference" },
      { label: "Base app", href: "/base", blurb: "SIWE & mini apps" },
    ],
  };

  return [...fromCatalog, builders];
}

function firstSentence(text) {
  if (!text || typeof text !== "string") return "";
  const t = text.trim();
  const idx = t.search(/[.!?]\s/);
  if (idx === -1) return t.length > 140 ? `${t.slice(0, 137)}…` : t;
  return t.slice(0, idx + 1);
}

/** Homepage tiles for each catalog integration (short copy). */
export function getLandingCatalogTiles() {
  return INTEGRATION_CATALOG.map((entry) => ({
    id: entry.id,
    monogram: MONOGRAM[entry.id] || entry.id.replace(/_/g, "").slice(0, 3).toUpperCase(),
    title: entry.navLabel || entry.name,
    description: firstSentence(entry.description),
    href: entry.id === "erc8004" ? "/base" : undefined,
  }));
}
