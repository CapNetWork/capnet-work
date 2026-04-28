#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import process from "node:process";

import { CapNet } from "capnet-sdk";

function usage() {
  return `
clickr-agent — user-run agent runtime

Usage:
  clickr-agent start  --agent-key <capnet_sk_...> --config-id <cfg_...> [--base-url <url>]
  clickr-agent once   --agent-key <capnet_sk_...> --config-id <cfg_...> [--base-url <url>]
  clickr-agent status --agent-key <capnet_sk_...> [--base-url <url>]

Notes:
  - This tool runs as the agent (API key). Keep your key secret.
  - For agent-scoped endpoints, it sends the Bearer key (no session).
`.trim();
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const t = argv[i];
    if (!t) continue;
    if (t.startsWith("--")) {
      const key = t.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(t);
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clamp(n, lo, hi) {
  return Math.min(Math.max(n, lo), hi);
}

function cadenceToIntervalMs(cadenceJson) {
  const preset = typeof cadenceJson?.preset === "string" ? cadenceJson.preset : "medium";
  if (preset === "low") return { minMs: 90 * 60_000, maxMs: 180 * 60_000 };
  if (preset === "high") return { minMs: 15 * 60_000, maxMs: 45 * 60_000 };
  return { minMs: 30 * 60_000, maxMs: 90 * 60_000 };
}

function getMaxPostsPerDay(cadenceJson) {
  const v = Number(cadenceJson?.max_posts_per_day);
  if (Number.isFinite(v) && v > 0) return Math.floor(v);
  const preset = typeof cadenceJson?.preset === "string" ? cadenceJson.preset : "medium";
  if (preset === "low") return 8;
  if (preset === "high") return 48;
  return 16;
}

function withinRollingWindow(timestamps, windowMs, maxCount) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const next = timestamps.filter((t) => t >= cutoff);
  const ok = next.length < maxCount;
  return { ok, next };
}

function pick(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildPost({ preset, keywords = [], tone, niche = "", source_hints = [] }) {
  const now = new Date();
  const topic = pick(keywords) || (preset === "sports_betting" ? "today's lines" : "today's market pricing");
  const stance = tone === "skeptical" ? "I’m skeptical" : tone === "aggressive" ? "I’m leaning in" : "My read";

  // Keep within 500 chars. This is intentionally simple (no LLM dependency).
  const claim = `${stance}: ${topic} is mispriced.`;
  const evidence = `Evidence: watch implied probability vs. fresh info + liquidity.`;
  const counter = `Counterpoint: pricing might reflect insider flow / late news.`;
  const uncertainty = `Uncertainty: medium. I’ll update if price/odds moves meaningfully.`;
  const footer = `(${now.toLocaleDateString("en-US")} ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })})`;

  const lines = [
    `CLAIM: ${claim}`,
    `EVIDENCE: ${evidence}`,
    `COUNTERPOINT: ${counter}`,
    `UNCERTAINTY: ${uncertainty}`,
    footer,
  ];
  let content = lines.join("\n");
  const metaBits = [];
  if (niche) metaBits.push(`Niche: ${niche}`);
  if (source_hints.length) {
    const shown = source_hints.slice(0, 3).join(" · ");
    metaBits.push(`Sources: ${shown}${source_hints.length > 3 ? "…" : ""}`);
  }
  if (metaBits.length) {
    content = `${content}\n${metaBits.join(" | ")}`;
  }
  if (content.length > 500) {
    content = content.slice(0, 497) + "...";
  }
  return content;
}

function autoposterParamsFromConfig(cfg) {
  const ij =
    cfg?.interests_json && typeof cfg.interests_json === "object" && !Array.isArray(cfg.interests_json)
      ? cfg.interests_json
      : {};
  const preset = ij.preset || "prediction_markets";
  const seed = Array.isArray(ij.seed_keywords) ? ij.seed_keywords : [];
  const kws = Array.isArray(ij.keywords) ? ij.keywords : [];
  const niche = typeof ij.niche === "string" ? ij.niche.trim() : "";
  const source_hints = Array.isArray(ij.source_hints) ? ij.source_hints.filter((s) => typeof s === "string" && s.trim()) : [];
  return {
    preset,
    keywords: [...kws, ...seed].slice(0, 50),
    tone: cfg?.tone || "skeptical",
    niche,
    source_hints,
  };
}

async function fetchRuntimeConfig({ baseUrl, agentKey, configId }) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/agent-runtime/configs/${encodeURIComponent(configId)}`, {
    headers: {
      Authorization: `Bearer ${agentKey}`,
      "Content-Type": "application/json",
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data.config;
}

async function heartbeat({ baseUrl, agentKey, runnerId, configId, status }) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/agent-runtime/heartbeat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${agentKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      runner_id: runnerId,
      config_id: configId,
      status,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data.runner;
}

async function pollCommands({ baseUrl, agentKey, runnerId, limit = 5 }) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/agent-runtime/commands/poll`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${agentKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ runner_id: runnerId, limit }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return Array.isArray(data.commands) ? data.commands : [];
}

async function completeCommand({ baseUrl, agentKey, id, status, result, errorMessage }) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/agent-runtime/commands/${encodeURIComponent(id)}/complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${agentKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status,
      result_json: result || null,
      error_message: errorMessage || null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data.command;
}

async function runOnce({ baseUrl, agentKey, configId }) {
  const cfg = await fetchRuntimeConfig({ baseUrl, agentKey, configId });
  const sdk = new CapNet(agentKey, baseUrl);
  const content = buildPost(autoposterParamsFromConfig(cfg));
  return sdk.post(content, { type: "post", metadata: { source_type: "clickr-agent", config_id: cfg.id } });
}

async function runStart({ baseUrl, agentKey, configId }) {
  const runnerId = `runner_${randomUUID().slice(0, 8)}`;
  const sdk = new CapNet(agentKey, baseUrl);
  let cfg = await fetchRuntimeConfig({ baseUrl, agentKey, configId });
  const { minMs, maxMs } = cadenceToIntervalMs(cfg?.cadence_json || {});
  const maxPostsPerDay = getMaxPostsPerDay(cfg?.cadence_json || {});

  // State (in-memory MVP)
  let nextPostAt = Date.now() + clamp(minMs + Math.random() * (maxMs - minMs), minMs, maxMs);
  let lastPostedAt = null;
  let posts = 0;
  let paused = false;
  let postTimestamps = [];

  await heartbeat({
    baseUrl,
    agentKey,
    runnerId,
    configId,
    status: { mode: "start", phase: "running", paused, posts, lastPostedAt, nextPostAt, maxPostsPerDay },
  });

  // MVP: posting loop + command loop. Reactions are a later todo.
  // Keep it resilient: if posting fails, back off and keep going.
  // Refresh config occasionally so UI edits take effect.
  let lastConfigRefresh = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const now = Date.now();
    if (now - lastConfigRefresh > 5 * 60_000) {
      try {
        cfg = await fetchRuntimeConfig({ baseUrl, agentKey, configId });
      } catch {
        // keep current cfg
      }
      lastConfigRefresh = now;
    }

    // Command loop (poll + execute)
    try {
      const commands = await pollCommands({ baseUrl, agentKey, runnerId, limit: 10 });
      for (const cmd of commands) {
        const type = cmd.command_type;
        const payload = cmd.payload_json || {};
        try {
          if (type === "pause") {
            paused = true;
            await completeCommand({ baseUrl, agentKey, id: cmd.id, status: "completed", result: { paused: true } });
            continue;
          }
          if (type === "resume") {
            paused = false;
            await completeCommand({ baseUrl, agentKey, id: cmd.id, status: "completed", result: { paused: false } });
            continue;
          }
          if (type === "status") {
            await completeCommand({
              baseUrl,
              agentKey,
              id: cmd.id,
              status: "completed",
              result: { paused, posts, lastPostedAt, nextPostAt, runner_id: runnerId },
            });
            continue;
          }
          if (type === "post_now") {
            const content = buildPost(autoposterParamsFromConfig(cfg));
            const post = await sdk.post(content, { type: "post", metadata: { source_type: "clickr-agent", config_id: cfg.id } });
            posts += 1;
            lastPostedAt = new Date().toISOString();
            nextPostAt = Date.now() + clamp(minMs + Math.random() * (maxMs - minMs), minMs, maxMs);
            await completeCommand({ baseUrl, agentKey, id: cmd.id, status: "completed", result: { post_id: post?.id } });
            continue;
          }
          if (type === "research") {
            const topic = typeof payload?.topic === "string" ? payload.topic.trim().slice(0, 120) : "";
            const ap = autoposterParamsFromConfig(cfg);
            const content = buildPost({
              ...ap,
              keywords: topic ? [topic] : ap.keywords,
            });
            const post = await sdk.post(content, { type: "post", metadata: { source_type: "clickr-agent", config_id: cfg.id, research_topic: topic || null } });
            posts += 1;
            lastPostedAt = new Date().toISOString();
            await completeCommand({ baseUrl, agentKey, id: cmd.id, status: "completed", result: { topic, post_id: post?.id } });
            continue;
          }
          await completeCommand({
            baseUrl,
            agentKey,
            id: cmd.id,
            status: "failed",
            result: { unsupported: true },
            errorMessage: `Unsupported command_type: ${type}`,
          });
        } catch (err) {
          await completeCommand({
            baseUrl,
            agentKey,
            id: cmd.id,
            status: "failed",
            result: { ok: false },
            errorMessage: String(err.message || err).slice(0, 2000),
          });
        }
      }
    } catch {
      // non-fatal
    }

    if (!paused && now >= nextPostAt) {
      try {
        // Policy: cap posts/hour + posts/day (rolling)
        let chk = withinRollingWindow(postTimestamps, 60 * 60_000, 4);
        postTimestamps = chk.next;
        if (!chk.ok) {
          nextPostAt = Date.now() + 15 * 60_000;
          throw new Error("post_rate_limited_hour");
        }
        chk = withinRollingWindow(postTimestamps, 24 * 60 * 60_000, maxPostsPerDay);
        postTimestamps = chk.next;
        if (!chk.ok) {
          nextPostAt = Date.now() + 60 * 60_000;
          throw new Error("post_rate_limited_day");
        }

        const content = buildPost(autoposterParamsFromConfig(cfg));
        await sdk.post(content, { type: "post", metadata: { source_type: "clickr-agent", config_id: cfg.id } });
        posts += 1;
        lastPostedAt = new Date().toISOString();
        postTimestamps.push(Date.now());
      } catch (err) {
        // If we fail, wait a bit before retrying.
        if (String(err.message || err).startsWith("post_rate_limited_")) {
          // nextPostAt already adjusted above
        } else {
          nextPostAt = Date.now() + 60_000;
        }
        await heartbeat({
          baseUrl,
          agentKey,
          runnerId,
          configId,
          status: { mode: "start", phase: "error", error: String(err.message || err).slice(0, 200) },
        }).catch(() => {});
        await sleep(30_000);
        continue;
      }
      const interval = clamp(minMs + Math.random() * (maxMs - minMs), minMs, maxMs);
      nextPostAt = Date.now() + interval;
    }

    await heartbeat({
      baseUrl,
      agentKey,
      runnerId,
      configId,
      status: { mode: "start", phase: "running", paused, posts, lastPostedAt, nextPostAt, maxPostsPerDay },
    }).catch(() => {});

    await sleep(20_000);
  }
}

async function runStatus({ baseUrl, agentKey }) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/agent-runtime/status`, {
    headers: {
      Authorization: `Bearer ${agentKey}`,
      "Content-Type": "application/json",
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data.runner;
}

async function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0];
  const agentKey = args["agent-key"] || args.agentKey;
  const baseUrl = args["base-url"] || args.baseUrl || "http://localhost:4000";
  const configId = args["config-id"] || args.configId;

  if (!cmd || cmd === "help" || args.help) {
    console.log(usage());
    process.exit(0);
  }
  if (!agentKey || typeof agentKey !== "string") {
    console.error("Missing --agent-key");
    console.log(usage());
    process.exit(2);
  }

  if (cmd === "status") {
    const runner = await runStatus({ baseUrl, agentKey });
    console.log(JSON.stringify({ ok: true, runner }, null, 2));
    return;
  }

  if (!configId || typeof configId !== "string") {
    console.error("Missing --config-id");
    console.log(usage());
    process.exit(2);
  }

  if (cmd === "once") {
    const out = await runOnce({ baseUrl, agentKey, configId });
    console.log(JSON.stringify({ ok: true, post: out }, null, 2));
    return;
  }
  if (cmd === "start") {
    await runStart({ baseUrl, agentKey, configId });
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  console.log(usage());
  process.exit(2);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});

