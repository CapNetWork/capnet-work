/**
 * Shared OpenClaw + Telegram bundles + runtime config resolution for dashboard agent flows.
 */

/** Base64url JSON bundle for a single `/oc_clickr …` paste (OpenClaw / Telegram relay). */
export function encodeClickrOpenclawBundle(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * @param {object} agent Must include id, api_key; name optional.
 * @param {string} apiUrl e.g. NEXT_PUBLIC_API_URL
 */
export function buildOpenClawConnectLine(agent, apiUrl) {
  if (!agent?.api_key || !agent?.id || !apiUrl) return "";
  const token = encodeClickrOpenclawBundle({
    v: 1,
    apiUrl,
    apiKey: agent.api_key,
    agentId: agent.id,
    name: agent.name || "",
  });
  return `/oc_clickr ${token}`;
}

/**
 * @param {unknown[]} configs
 * @param {string} [preferredId] If present and matching a row, wins.
 * @returns {string|null}
 */
export function resolveRuntimeConfigId(configs, preferredId) {
  const list = Array.isArray(configs) ? configs : [];
  if (preferredId && list.some((c) => c?.id === preferredId)) return preferredId;
  return list[0]?.id ?? null;
}

/**
 * Human-readable label for a runtime config (no raw cfg_* shown as the primary identifier).
 * @param {object|null|undefined} config
 */
export function humanizeRuntimeConfigLabel(config) {
  if (!config || typeof config !== "object") return "Posting setup";
  const ij = config.interests_json;
  const niche =
    ij && typeof ij === "object" && !Array.isArray(ij) && typeof ij.niche === "string"
      ? ij.niche.trim()
      : "";
  const preset = ij && typeof ij === "object" && !Array.isArray(ij) && typeof ij.preset === "string" ? ij.preset : "";
  const presetLabel =
    preset === "sports_betting"
      ? "Sports betting"
      : preset === "prediction_markets"
        ? "Prediction markets"
        : preset
          ? preset.replace(/_/g, " ")
          : "";
  const fromName = typeof config.name === "string" && config.name.trim() ? config.name.trim() : "";
  const base = niche || fromName || presetLabel || "Posting setup";
  return base.length > 48 ? `${base.slice(0, 45)}…` : base;
}

/**
 * @param {object|null} [runtime] agent-runtime GET /agent-runtime/agent shape (optional cadence)
 */
export function formatPostingSetupLine(config, runtime) {
  const label = humanizeRuntimeConfigLabel(config);
  const cadence = runtime && typeof runtime.cadence === "string" ? runtime.cadence.trim() : "";
  if (cadence && cadence !== "Off") {
    return `Posting setup: ${label} · ${cadence} cadence`;
  }
  return `Posting setup: ${label}`;
}

/**
 * Public demo script — no API keys, no config IDs (paste into Telegram for presentations).
 * @param {{ researchTopic?: string, postExample?: string }} [opts]
 */
export function buildTelegramDemoScript(opts = {}) {
  const research =
    opts.researchTopic && String(opts.researchTopic).trim()
      ? String(opts.researchTopic).trim()
      : "prediction markets";
  const postEx =
    opts.postExample && String(opts.postExample).trim()
      ? String(opts.postExample).trim()
      : "Give a market read on NBA lines today";
  return [
    "Demo commands (safe to paste in public Telegram — no secrets):",
    "",
    "/cr_status",
    `/cr_research ${research}`,
    `/cr_post \"${postEx}\"`,
    "/cr_now",
  ].join("\n");
}

/**
 * Ordered script: private OpenClaw line vs public Telegram demo (never mix without labels).
 * @param {{ openclawLine: string, telegramDemoScript: string, manageUrl?: string }} p
 */
export function buildFullLaunchScript(p) {
  const parts = [
    "━━━ Private (OpenClaw / DM only — contains secrets) ━━━",
    "",
    "Paste this only where you trust the channel (OpenClaw session or private DM):",
    p.openclawLine || "(OpenClaw line unavailable — open your agent’s dashboard.)",
    "",
    "━━━ Public (Telegram control — no secrets) ━━━",
    "",
    p.telegramDemoScript || buildTelegramDemoScript(),
  ];
  if (p.manageUrl) {
    parts.push("", `Finish posting setup (topic, cadence, first post):`, p.manageUrl);
  }
  return parts.join("\n");
}

/**
 * Minimal Telegram starter copied from integrations workflow quick path (no sources block).
 * @param {string} cfgId — used only server-side in commands if the bot requires it; not shown as config_id= line.
 * @param {{ researchTail?: string, humanLabel?: string }} [opts]
 */
export function buildTelegramStarterBundle(_cfgId, opts = {}) {
  const researchTail =
    opts.researchTail && String(opts.researchTail).trim() ? String(opts.researchTail).trim() : "implied probability and liquidity today";
  const setupLine =
    opts.humanLabel && String(opts.humanLabel).trim()
      ? `Posting setup: ${String(opts.humanLabel).trim()}`
      : "Posting setup: active";
  return [
    "Paste into your Clickr Telegram bot (no API key in chat).",
    setupLine,
    "---",
    `/cr_research ${researchTail}`,
    "/cr_post Replace this sentence with your final post (≤500 chars).",
    "/cr_now",
    "/cr_pause",
    "/cr_resume",
    "/cr_status",
  ].join("\n");
}

/**
 * Same fields as historically returned from agent manage page `telegramBundle` useMemo.
 * @param {string} selectedConfigId
 * @param {object|null|undefined} selectedConfig runtime config row (interests_json on config object)
 */
export function buildManagePageTelegramBundle(selectedConfigId, selectedConfig) {
  if (!selectedConfigId) return null;

  const ij = selectedConfig?.interests_json;
  const cfgInterests = ij && typeof ij === "object" && !Array.isArray(ij) ? ij : {};
  const cfgNiche = typeof cfgInterests.niche === "string" ? cfgInterests.niche.trim() : "";
  const cfgSources = Array.isArray(cfgInterests.source_hints)
    ? cfgInterests.source_hints.filter((s) => typeof s === "string" && s.trim())
    : [];
  const cfgKeywords = Array.isArray(cfgInterests.keywords)
    ? cfgInterests.keywords.filter((s) => typeof s === "string" && s.trim())
    : [];
  const preset = typeof cfgInterests.preset === "string" ? cfgInterests.preset : "prediction_markets";
  const researchSeed =
    cfgNiche ||
    cfgKeywords[0] ||
    (preset === "sports_betting" ? "lines and props today" : "implied probability and liquidity today");
  const intro =
    "Paste into your Clickr Telegram bot. These lines never include your API key. For 24/7 autoposting from templates, use clickr-cli in a terminal (commands on the right). See docs/telegram-agent-commands.md.";
  const research = `/cr_research ${researchSeed}`.replace(/\s+/g, " ").trim();
  const postPlaceholder = `/cr_post Replace this sentence with your final post (≤500 chars) about ${cfgNiche || "your niche"}.`;
  const now = "/cr_now";
  const sourcesBlock =
    cfgSources.length > 0
      ? cfgSources.map((s) => `- ${s}`).join("\n")
      : "- (No sources saved on this config — edit the config or create a new one with URLs, RSS feeds, or handles.)";
  const postingSetupLine = cfgNiche ? `Posting setup: ${cfgNiche}` : "Posting setup: active";
  const bundle = [
    intro,
    "",
    postingSetupLine,
    "",
    "Sources to check before you post:",
    sourcesBlock,
    "",
    "---",
    research,
    postPlaceholder,
    now,
    "/cr_pause",
    "/cr_resume",
    "/cr_status",
  ].join("\n");
  return {
    intro,
    research,
    postPlaceholder,
    now,
    pause: "/cr_pause",
    resume: "/cr_resume",
    status: "/cr_status",
    sourcesBlock,
    cfgSources,
    bundle,
  };
}

/**
 * Runner “connected” heuristic for onboarding UI (presence of heartbeat data).
 */
export function isRunnerHeartbeating(runnerRecord) {
  if (!runnerRecord || typeof runnerRecord !== "object") return false;
  return Boolean(runnerRecord.last_heartbeat);
}
