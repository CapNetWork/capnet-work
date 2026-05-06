/**
 * Mission-control status for dashboard agent detail.
 * Single source of truth: derive UI + primary CTA from runtime + runner signals.
 *
 * Mapping (see comments when adjusting):
 * - ERROR: GET/PATCH agent-runtime failed (runtimeError string).
 * - NEEDS_OPENCLAW: no runner heartbeat — user must paste OpenClaw connect line / start runner device.
 * - NEEDS_RUNTIME_CONFIG: heartbeat present but posting not active (cadence Off or agent disabled).
 * - RUNNER_IDLE: posting active + heartbeat but runner.status !== "live" (offline/paused).
 * - RUNNING: posting active + heartbeat + runner.status === "live".
 *
 * NEEDS_TELEGRAM / CREATED reserved for future product gates; not emitted today.
 */

import { isRunnerHeartbeating } from "@/lib/agentConnectBundles";

/** @typedef {'ERROR'|'NEEDS_OPENCLAW'|'NEEDS_RUNTIME_CONFIG'|'RUNNER_IDLE'|'RUNNING'} AgentMissionStatus */

/** @typedef {{ id: string, label: string, done: boolean, warn?: boolean }} LadderStep */

const CADENCE_HINT = {
  Off: "Off",
  Slow: "Slow (~1/day)",
  Normal: "Normal (~3/day)",
  Fast: "Fast (~8/day)",
};

/**
 * @param {string|null|undefined} runtimeError
 * @param {object|null|undefined} runtime
 * @param {object|null|undefined} agent
 * @returns {AgentMissionStatus}
 */
export function getAgentStatus(runtimeError, runtime, agent) {
  if (runtimeError && String(runtimeError).trim()) return "ERROR";

  const runner = runtime?.runner;
  const heartbeatOk = isRunnerHeartbeating(runner);
  const cadence = runtime?.cadence && String(runtime.cadence).trim() ? String(runtime.cadence).trim() : "Off";
  const runtimeActive = Boolean(runtime?.is_enabled && cadence && cadence !== "Off");

  if (!heartbeatOk) return "NEEDS_OPENCLAW";
  if (!runtimeActive) return "NEEDS_RUNTIME_CONFIG";

  const rs = runner?.status && String(runner.status).trim() ? String(runner.status).trim().toLowerCase() : "offline";
  if (rs === "live") return "RUNNING";
  return "RUNNER_IDLE";
}

/**
 * @param {AgentMissionStatus} status
 * @returns {{ intent: 'view-error'|'open-connect'|'open-runtime'|'start-runner'|'post-now', label: string }}
 */
export function getAgentNextAction(status) {
  switch (status) {
    case "ERROR":
      return { intent: "view-error", label: "View issue" };
    case "NEEDS_OPENCLAW":
      return { intent: "open-connect", label: "Connect OpenClaw" };
    case "NEEDS_RUNTIME_CONFIG":
      return { intent: "open-runtime", label: "Create schedule" };
    case "RUNNER_IDLE":
      return { intent: "start-runner", label: "Start runner" };
    case "RUNNING":
    default:
      return { intent: "post-now", label: "Post now" };
  }
}

/**
 * @param {AgentMissionStatus} status
 * @returns {{ headline: string, nextStep: string }}
 */
export function getStatusCardHeadlines(status) {
  switch (status) {
    case "ERROR":
      return { headline: "Error", nextStep: "Fix the runtime issue below, then refresh." };
    case "NEEDS_OPENCLAW":
      return {
        headline: "Needs OpenClaw connection",
        nextStep: "Connect this agent to OpenClaw on a trusted device so the runner can heartbeat.",
      };
    case "NEEDS_RUNTIME_CONFIG":
      return {
        headline: "Needs posting schedule",
        nextStep: "Turn on cadence, set a topic, and resume so this agent can post.",
      };
    case "RUNNER_IDLE":
      return {
        headline: "Runner idle",
        nextStep: "Bring the runner online or resume posting from your automation.",
      };
    case "RUNNING":
    default:
      return {
        headline: "Running",
        nextStep: "Runner is live — use Post now or Telegram commands to publish.",
      };
  }
}

/**
 * @param {object|null|undefined} runtime
 * @param {object|null|undefined} agent
 */
export function formatScheduleSummary(runtime, agent) {
  const cadence = runtime?.cadence && String(runtime.cadence).trim() ? String(runtime.cadence).trim() : "Off";
  const cadenceLabel = CADENCE_HINT[cadence] || cadence;
  const topic =
    (runtime?.topic && String(runtime.topic).trim()) ||
    (agent?.domain && String(agent.domain).trim()) ||
    "—";
  const shortTopic = topic.length > 48 ? `${topic.slice(0, 45)}…` : topic;
  return `${cadenceLabel} · ${shortTopic}`;
}

/**
 * @param {object|null|undefined} runtime
 * @param {(iso: string|null|undefined) => string|null} timeAgo
 */
export function formatLastHeartbeat(runtime, timeAgo) {
  const hb = runtime?.runner?.last_heartbeat;
  if (!hb) return "—";
  return timeAgo(hb) || "—";
}

/**
 * Ladder steps share the same signals as getAgentStatus (no independent heuristics).
 * Telegram step is informational (optional); we mirror checklist: same as OpenClaw row until product has a signal.
 *
 * @param {object|null|undefined} agent
 * @param {object|null|undefined} runtime
 */
export function getMissionLadderSteps(agent, runtime) {
  const hasTraits = Boolean(
    (agent?.perspective && String(agent.perspective).trim()) ||
      (Array.isArray(agent?.skills) && agent.skills.length) ||
      (Array.isArray(agent?.goals) && agent.goals.length) ||
      (Array.isArray(agent?.tasks) && agent.tasks.length)
  );
  const heartbeatOk = isRunnerHeartbeating(runtime?.runner);
  const cadence = runtime?.cadence && String(runtime.cadence).trim() ? String(runtime.cadence).trim() : "Off";
  const runtimeActive = Boolean(runtime?.is_enabled && cadence && cadence !== "Off");
  const runnerStatus = runtime?.runner?.status && String(runtime.runner.status).trim().toLowerCase();
  const runnerLive = runnerStatus === "live";

  /** @type {LadderStep[]} */
  return [
    { id: "created", label: "Agent created", done: Boolean(agent?.name) },
    { id: "traits", label: "Traits on profile", done: hasTraits, warn: !hasTraits },
    { id: "openclaw", label: "OpenClaw / runner", done: heartbeatOk, warn: !heartbeatOk },
    {
      id: "telegram",
      label: "Telegram control (optional)",
      done: heartbeatOk,
      warn: false,
    },
    { id: "schedule", label: "Posting schedule active", done: runtimeActive, warn: !runtimeActive && heartbeatOk },
    { id: "live", label: "Runner live", done: runnerLive, warn: runtimeActive && heartbeatOk && !runnerLive },
  ];
}
