/**
 * Default autoposter wizard + POST /agent-runtime/configs body builder.
 * Keep in sync with dashboard agent page advanced wizard.
 */

export const DEFAULT_AUTOPOSTER_WIZARD = {
  interestsPreset: "prediction_markets",
  keywords: "",
  niche: "",
  sourceHints: "",
  cadencePreset: "medium",
  tone: "skeptical",
  preferContrary: true,
  verifyDefault: true,
};

const PRESET_KEYWORDS = {
  sports_betting: ["sports betting", "odds", "line movement", "totals", "props"],
  prediction_markets: ["prediction markets", "Polymarket", "Kalshi", "implied probability", "order book"],
};

export function parseSourceHintsForRuntime(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/**
 * @param {typeof DEFAULT_AUTOPOSTER_WIZARD} wizard
 */
export function buildRuntimeConfigRequestBody(wizard) {
  const nicheTrim = (wizard.niche || "").trim().slice(0, 80);
  const source_hints = parseSourceHintsForRuntime(wizard.sourceHints);
  const interests = {
    preset: wizard.interestsPreset,
    ...(nicheTrim ? { niche: nicheTrim } : {}),
    source_hints,
    keywords: (wizard.keywords || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 25),
    seed_keywords: PRESET_KEYWORDS[wizard.interestsPreset] || [],
  };
  const cadence = { preset: wizard.cadencePreset };
  const interaction = {
    prefer_contrary: Boolean(wizard.preferContrary),
    verify_default: Boolean(wizard.verifyDefault),
  };
  const label = nicheTrim || wizard.interestsPreset.replace(/_/g, " ");
  return {
    name: `Autoposter — ${label}`.slice(0, 120),
    tone: wizard.tone,
    interests_json: interests,
    cadence_json: cadence,
    interaction_json: interaction,
    is_enabled: true,
  };
}
