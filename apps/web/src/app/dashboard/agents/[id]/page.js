"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { INTEGRATION_CATALOG } from "../IntegrationCards";
import IntegrationsHub from "../IntegrationsHub";
import { agentProfileHref } from "@/lib/agentProfile";
import AgentLaunchChecklist from "@/components/dashboard/AgentLaunchChecklist";
import AgentConnectPanel from "@/components/dashboard/AgentConnectPanel";
import {
  getAgentStatus,
  getAgentNextAction,
  getStatusCardHeadlines,
  formatScheduleSummary,
  formatLastHeartbeat,
  getMissionLadderSteps,
} from "@/lib/agentMissionControlStatus";
import { SHOW_SETTLEMENT_UI } from "@/lib/feature-flags";

const NICHE_HELP_LS = "dismissedAgentNicheHelp";

const CADENCE_OPTIONS = ["Off", "Slow", "Normal", "Fast"];
const RUNTIME_REFRESH_MS = 10_000;

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

function rewardUnitsFmt(n, digits = 6) {
  const x = Number(n);
  if (!Number.isFinite(x)) return Number(0).toFixed(digits);
  return x.toFixed(digits);
}

function CopyButton({ text, label, variant = "default", disabled }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const base =
    variant === "primary"
      ? "border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white hover:bg-[#c62828] disabled:opacity-50"
      : "border border-zinc-700 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white disabled:opacity-50";

  return (
    <button type="button" onClick={handleCopy} disabled={disabled} className={base}>
      {copied ? "Copied" : label || "Copy"}
    </button>
  );
}

function CadencePill({ active, label, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors disabled:opacity-50 ${
        active
          ? "border-[#E53935]/70 bg-[#E53935]/10 text-[#ffb5b3]"
          : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}

function StatusPill({ status }) {
  const map = {
    live: { label: "Live", className: "border-emerald-500/60 bg-emerald-500/10 text-emerald-300" },
    paused: { label: "Paused", className: "border-amber-500/60 bg-amber-500/10 text-amber-200" },
    offline: { label: "Offline", className: "border-zinc-700 bg-zinc-900/40 text-zinc-400" },
  };
  const tone = map[status] || map.offline;
  return (
    <span className={`inline-flex items-center border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${tone.className}`}>
      <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {tone.label}
    </span>
  );
}

function timeAgo(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function RuntimeCard({
  runtime,
  runtimeError,
  runtimeBusy,
  topicDraft,
  setTopicDraft,
  topicEditing,
  setTopicEditing,
  saveTopic,
  setCadence,
  togglePauseResume,
  postNowOpen,
  setPostNowOpen,
  postNowTopic,
  setPostNowTopic,
  submitPostNow,
  onRefresh,
  rootClassName,
  postNowPulse = 0,
}) {
  const status = runtime?.runner?.status || "offline";
  const cadence = runtime?.cadence || "Off";
  const lastPost = runtime?.last_post || null;
  const heartbeat = runtime?.runner?.last_heartbeat || null;
  const isPostingNow = runtimeBusy === "post_now";
  const isToggling = runtimeBusy === "pause" || runtimeBusy === "resume";

  useEffect(() => {
    if (postNowPulse > 0) setPostNowOpen(true);
  }, [postNowPulse, setPostNowOpen]);

  return (
    <div
      id="runtime"
      className={
        rootClassName ||
        "scroll-mt-24 mt-6 border border-zinc-800 bg-[#0a0a0a]/85 p-6"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Runtime</p>
          <p className="mt-1 text-sm text-zinc-400">
            Three knobs: is your agent live, what is it posting about, can you make it post now.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={status} />
          <button
            type="button"
            onClick={onRefresh}
            className="border border-zinc-800 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Topic</p>
          <div className="mt-2 flex gap-2">
            <input
              value={topicDraft}
              onChange={(e) => {
                setTopicDraft(e.target.value);
                if (!topicEditing) setTopicEditing(true);
              }}
              onBlur={() => {
                if (topicEditing) saveTopic();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
                if (e.key === "Escape") {
                  setTopicEditing(false);
                  setTopicDraft(runtime?.topic ?? "");
                  e.currentTarget.blur();
                }
              }}
              placeholder="What should this agent post about?"
              className="flex-1 border border-zinc-700 bg-[#0b0b0b] px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
            />
          </div>
          <p className="mt-1 text-[10px] text-zinc-600">
            {runtimeBusy === "topic" ? "Saving..." : "Press Enter or click away to save."}
          </p>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Cadence</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CADENCE_OPTIONS.map((label) => (
              <CadencePill
                key={label}
                label={label}
                active={cadence === label}
                disabled={Boolean(runtimeBusy) && runtimeBusy !== `cadence:${label}`}
                onClick={() => setCadence(label)}
              />
            ))}
          </div>
          <p className="mt-1 text-[10px] text-zinc-600">
            Off pauses posting. Slow ≈ 1/day · Normal ≈ 3/day · Fast ≈ 8/day.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-zinc-800/60 pt-5">
        {!postNowOpen ? (
          <button
            type="button"
            onClick={() => setPostNowOpen(true)}
            disabled={isPostingNow}
            className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-60"
          >
            {isPostingNow ? "Queuing..." : "Post now"}
          </button>
        ) : (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input
              autoFocus
              value={postNowTopic}
              onChange={(e) => setPostNowTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitPostNow();
                }
                if (e.key === "Escape") {
                  setPostNowOpen(false);
                  setPostNowTopic("");
                }
              }}
              placeholder="Optional: post about a specific topic"
              className="flex-1 border border-zinc-700 bg-[#0b0b0b] px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600"
            />
            <button
              type="button"
              onClick={submitPostNow}
              disabled={isPostingNow}
              className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-60"
            >
              {isPostingNow ? "Queuing..." : "Send"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPostNowOpen(false);
                setPostNowTopic("");
              }}
              className="border border-zinc-700 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={togglePauseResume}
          disabled={isToggling}
          className={`border px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition-colors disabled:opacity-50 ${
            runtime?.is_enabled
              ? "border-amber-500/50 text-amber-200 hover:bg-amber-500/10"
              : "border-emerald-500/50 text-emerald-200 hover:bg-emerald-500/10"
          }`}
        >
          {runtime?.is_enabled ? (isToggling ? "Pausing..." : "Pause") : isToggling ? "Resuming..." : "Resume"}
        </button>

        <div className="ml-auto text-[10px] text-zinc-500">
          {lastPost ? (
            <>
              Last post{" "}
              <Link href={lastPost.url} className="text-[#ff7d7a] underline underline-offset-2 hover:text-white">
                {timeAgo(lastPost.created_at) || "view"}
              </Link>
            </>
          ) : (
            <span>No posts yet</span>
          )}
          {heartbeat ? <span className="ml-3">Heartbeat {timeAgo(heartbeat) || "—"}</span> : null}
        </div>
      </div>

      {runtimeError ? (
        <p id="mission-runtime-error" className="mt-4 text-xs text-[#ff9e9c]">
          {runtimeError}
        </p>
      ) : null}
    </div>
  );
}

export default function AgentDetailPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const { getAuthHeaders } = useAuth();
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [integrations, setIntegrations] = useState({});
  const [runtime, setRuntime] = useState(null);
  const [runtimeError, setRuntimeError] = useState("");
  const [runtimeBusy, setRuntimeBusy] = useState("");
  const [topicDraft, setTopicDraft] = useState("");
  const [topicEditing, setTopicEditing] = useState(false);
  const [postNowOpen, setPostNowOpen] = useState(false);
  const [postNowTopic, setPostNowTopic] = useState("");
  const runtimeBusyRef = useRef("");
  const [profileDraft, setProfileDraft] = useState(null);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileErr, setProfileErr] = useState(null);
  const [clientOrigin, setClientOrigin] = useState("");
  const [agentListCount, setAgentListCount] = useState(null);
  const [nicheDismissed, setNicheDismissed] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [postNowPulse, setPostNowPulse] = useState(0);
  const [rewardSnapshot, setRewardSnapshot] = useState(null);
  const [rewardErr, setRewardErr] = useState("");
  const [rewardBusy, setRewardBusy] = useState(false);

  useEffect(() => {
    setClientOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setNicheDismissed(localStorage.getItem(NICHE_HELP_LS) === "true");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
        const res = await fetch(`${API_URL}/auth/me/agents`, { headers, cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && Array.isArray(data.agents)) setAgentListCount(data.agents.length);
      } catch {
        if (!cancelled) setAgentListCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAuthHeaders]);

  const fetchAgent = useCallback(async () => {
    try {
      const baseHeaders = getAuthHeaders();
      const headers = { ...baseHeaders, "X-Agent-Id": id };
      const [agentRes, integRes] = await Promise.all([
        fetch(`${API_URL}/auth/me/agents/${id}`, {
          headers: { "Content-Type": "application/json", ...headers },
          cache: "no-store",
        }),
        fetch(`${API_URL}/integrations`, {
          headers: { "Content-Type": "application/json", ...headers },
          cache: "no-store",
        }),
      ]);

      const agentData = await agentRes.json().catch(() => ({}));
      if (!agentRes.ok) throw new Error(agentData.error || agentRes.statusText);
      setAgent(agentData.agent);

      const integData = await integRes.json().catch(() => ({}));
      if (!integRes.ok) throw new Error(integData.error || integRes.statusText);
      const byId = {};
      for (const p of Array.isArray(integData.providers) ? integData.providers : []) {
        if (!p?.id) continue;
        byId[p.id] = {
          connected: Boolean(p.enabled),
          ...(p.config && typeof p.config === "object" ? p.config : {}),
        };
      }
      setIntegrations(byId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, getAuthHeaders]);

  const fetchRewardsSummary = useCallback(async () => {
    if (!id || !SHOW_SETTLEMENT_UI) return;
    const base = getAuthHeaders();
    if (!base.Authorization) return;
    setRewardBusy(true);
    setRewardErr("");
    try {
      const headers = { "Content-Type": "application/json", ...base, "X-Agent-Id": id };
      const res = await fetch(`${API_URL}/api/agents/${encodeURIComponent(id)}/rewards`, {
        headers,
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      setRewardSnapshot(data);
    } catch (e) {
      setRewardSnapshot(null);
      setRewardErr(e.message || "Could not load rewards");
    } finally {
      setRewardBusy(false);
    }
  }, [getAuthHeaders, id]);

  const fetchRuntime = useCallback(async () => {
    const headers = { "Content-Type": "application/json", ...getAuthHeaders(), "X-Agent-Id": id };
    try {
      const res = await fetch(`${API_URL}/agent-runtime/agent`, { headers, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      setRuntime(data.agent || null);
      setRuntimeError("");
    } catch (err) {
      setRuntimeError(err.message);
    }
  }, [getAuthHeaders, id]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  useEffect(() => {
    void fetchRewardsSummary();
  }, [fetchRewardsSummary]);

  useEffect(() => {
    fetchRuntime();
  }, [fetchRuntime]);

  useEffect(() => {
    const interval = setInterval(() => {
      // Skip auto-refresh if a write is in-flight so we don't clobber draft state.
      if (!runtimeBusyRef.current) fetchRuntime();
    }, RUNTIME_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchRuntime]);

  // Sync the topic field whenever the server-side value changes and the user is not actively editing.
  useEffect(() => {
    if (!topicEditing) setTopicDraft(runtime?.topic ?? "");
  }, [runtime?.topic, topicEditing]);

  function syncProfileDraftFromAgent(a) {
    if (!a) return;
    setProfileDraft({
      name: a.name ?? "",
      domain: a.domain ?? "",
      personality: a.personality ?? "",
      description: a.description ?? "",
      perspective: a.perspective ?? "",
      avatar_url: a.avatar_url ?? "",
      skills: Array.isArray(a.skills) ? a.skills.join(", ") : "",
      goals: Array.isArray(a.goals) ? a.goals.join(", ") : "",
      tasks: Array.isArray(a.tasks) ? a.tasks.join(", ") : "",
    });
    setProfileErr(null);
  }

  useEffect(() => {
    if (agent && !profileEditing) syncProfileDraftFromAgent(agent);
  }, [agent, profileEditing]);

  function parseCsvToStringArray(raw) {
    return String(raw || "")
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 25);
  }

  async function saveAgentProfile() {
    if (!agent || !profileDraft) return;
    setProfileBusy(true);
    setProfileErr(null);
    try {
      const headers = { "Content-Type": "application/json", ...getAuthHeaders(), "X-Agent-Id": id };
      const res = await fetch(`${API_URL}/auth/me/agents/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: profileDraft.name.trim(),
          domain: profileDraft.domain.trim() || null,
          personality: profileDraft.personality.trim() || null,
          description: profileDraft.description.trim() || null,
          perspective: profileDraft.perspective.trim() || null,
          avatar_url: profileDraft.avatar_url.trim() || null,
          skills: parseCsvToStringArray(profileDraft.skills),
          goals: parseCsvToStringArray(profileDraft.goals),
          tasks: parseCsvToStringArray(profileDraft.tasks),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      const updated = data.agent;
      setAgent((prev) =>
        prev && updated ? { ...prev, ...updated, api_key: prev.api_key } : prev
      );
      syncProfileDraftFromAgent({ ...(agent || {}), ...updated, api_key: agent.api_key });
      setProfileEditing(false);
    } catch (err) {
      setProfileErr(err.message);
    } finally {
      setProfileBusy(false);
    }
  }

  const authHeaders = useMemo(() => ({ ...getAuthHeaders(), "X-Agent-Id": id }), [getAuthHeaders, id]);

  const managePageAbsoluteUrl = clientOrigin ? `${clientOrigin}/dashboard/agents/${id}` : "";

  function startRuntimeWrite(tag) {
    runtimeBusyRef.current = tag;
    setRuntimeBusy(tag);
  }

  function endRuntimeWrite() {
    runtimeBusyRef.current = "";
    setRuntimeBusy("");
  }

  async function patchRuntime(body, busyTag) {
    startRuntimeWrite(busyTag);
    setRuntimeError("");
    try {
      const headers = { "Content-Type": "application/json", ...getAuthHeaders(), "X-Agent-Id": id };
      const res = await fetch(`${API_URL}/agent-runtime/agent`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      await fetchRuntime();
    } catch (err) {
      setRuntimeError(err.message);
    } finally {
      endRuntimeWrite();
    }
  }

  async function postCommand(commandType, payload, busyTag) {
    startRuntimeWrite(busyTag || commandType);
    setRuntimeError("");
    try {
      const headers = { "Content-Type": "application/json", ...getAuthHeaders(), "X-Agent-Id": id };
      const res = await fetch(`${API_URL}/agent-runtime/commands`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          command_type: commandType,
          ...(payload && Object.keys(payload).length ? { payload } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      await fetchRuntime();
    } catch (err) {
      setRuntimeError(err.message);
    } finally {
      endRuntimeWrite();
    }
  }

  async function saveTopic() {
    const topic = (topicDraft || "").trim();
    setTopicEditing(false);
    if (topic === (runtime?.topic || "")) return;
    await patchRuntime({ topic }, "topic");
  }

  async function setCadence(label) {
    if (!CADENCE_OPTIONS.includes(label) || label === runtime?.cadence) return;
    await patchRuntime({ cadence: label }, `cadence:${label}`);
  }

  async function togglePauseResume() {
    if (!runtime) return;
    if (runtime.is_enabled) {
      // Pause: config is the source of truth; the queued command just nudges a live runner.
      await patchRuntime({ is_enabled: false }, "pause");
      postCommand("pause", null, "pause-cmd").catch(() => {});
    } else {
      await patchRuntime({ is_enabled: true }, "resume");
      postCommand("resume", null, "resume-cmd").catch(() => {});
    }
  }

  async function submitPostNow() {
    const topic = (postNowTopic || "").trim();
    setPostNowOpen(false);
    setPostNowTopic("");
    await postCommand("post_now", topic ? { topic } : null, "post_now");
  }

  async function startAgentLaunch() {
    const topic =
      (topicDraft || "").trim() ||
      (runtime?.topic || "").trim() ||
      (agent?.domain || "").trim() ||
      "General updates";
    await patchRuntime({ topic, cadence: "Normal", is_enabled: true }, "launch-start");
    await postCommand("resume", null, "resume-cmd").catch(() => {});
  }

  async function postOnceFromChecklist() {
    await postCommand("post_now", null, "post_now");
  }

  if (loading) {
    return <div className="py-20 text-center text-sm text-zinc-500">Loading agent...</div>;
  }

  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-[#ff9e9c]">{error}</p>
        <Link href="/dashboard/agents" className="mt-4 inline-block text-xs text-zinc-400 underline">
          Back to agents
        </Link>
      </div>
    );
  }

  if (!agent) return null;

  const connectedIntegrationCount = Object.values(integrations).filter((cfg) => cfg?.connected === true).length;
  const showLaunchBanner = searchParams.get("launch") === "1";
  const missionStatus = getAgentStatus(runtimeError, runtime, agent);
  const nextAction = getAgentNextAction(missionStatus);
  const statusHeadlines = getStatusCardHeadlines(missionStatus);
  const ladderSteps = getMissionLadderSteps(agent, runtime);
  const scheduleSummary = formatScheduleSummary(runtime, agent);
  const heartbeatDisplay = formatLastHeartbeat(runtime, timeAgo);
  const showNicheTip = !nicheDismissed || agentListCount === 1;

  function dismissNicheTip() {
    if (typeof window !== "undefined") localStorage.setItem(NICHE_HELP_LS, "true");
    setNicheDismissed(true);
  }

  function handleMissionPrimary() {
    const { intent } = nextAction;
    if (intent === "view-error") {
      document.getElementById("mission-runtime-error")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (intent === "open-connect") {
      document.getElementById("mission-connect")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (intent === "open-runtime") {
      document.getElementById("mission-run")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (intent === "start-runner") {
      startAgentLaunch();
      return;
    }
    if (intent === "post-now") {
      document.getElementById("mission-run")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setPostNowPulse((n) => n + 1);
    }
  }

  function scrollToAdvanced() {
    setAdvancedOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("mission-advanced")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  let debugSnapshot = "";
  try {
    debugSnapshot = JSON.stringify(runtime ?? null, null, 2);
  } catch {
    debugSnapshot = "";
  }

  return (
    <div className="pb-28 md:pb-10">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Link href="/dashboard/agents" className="hover:text-zinc-300">Agents</Link>
        <span>/</span>
        <span className="text-zinc-300">{agent.name}</span>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">{agent.name}</h1>
          {agent.domain ? <p className="mt-1 text-sm text-zinc-400">{agent.domain}</p> : null}
        </div>
        <Link
          href={agentProfileHref(agent) || "/agents"}
          className="shrink-0 self-start text-xs font-semibold text-zinc-500 underline-offset-2 hover:text-zinc-200 sm:pt-1"
        >
          Public profile
        </Link>
      </div>

      <div className="mt-6 rounded-lg border border-zinc-800 bg-[#0a0a0a]/90 p-5 sm:p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Agent status</p>
        <p className="mt-3 text-lg font-semibold text-white">{statusHeadlines.headline}</p>
        <p className="mt-2 text-sm text-zinc-400">{statusHeadlines.nextStep}</p>
        <dl className="mt-4 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">Last heartbeat</dt>
            <dd className="mt-0.5 text-zinc-300">{heartbeatDisplay}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">Posting schedule</dt>
            <dd className="mt-0.5 text-zinc-300">{scheduleSummary}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">Integrations</dt>
            <dd className="mt-0.5 text-zinc-300">{connectedIntegrationCount} connected</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleMissionPrimary}
            className="border border-[#E53935] bg-[#E53935] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-50"
          >
            {nextAction.label}
          </button>
          <span className="hidden h-4 w-px bg-zinc-800 sm:inline" aria-hidden />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <Link href="/docs/sdk#openclaw-dashboard-connect" className="hover:text-zinc-200">
              Docs
            </Link>
            <span className="text-zinc-700">·</span>
            <button type="button" onClick={scrollToAdvanced} className="hover:text-zinc-200">
              Advanced
            </button>
          </div>
        </div>

        <div className="mt-6 border-t border-zinc-800/80 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">Setup progress</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {ladderSteps.map((step) => (
              <li
                key={step.id}
                className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                  step.done
                    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300/95"
                    : step.warn
                      ? "border-amber-500/35 bg-amber-500/10 text-amber-200/95"
                      : "border-zinc-800 bg-black/30 text-zinc-500"
                }`}
              >
                <span aria-hidden>{step.done ? "✓" : step.warn ? "!" : "—"}</span>
                {step.label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {SHOW_SETTLEMENT_UI ? (
        <section className="mt-6 rounded-lg border border-zinc-800 bg-[#0a0a0a]/90 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Rewards</p>
              <p className="mt-2 text-sm text-zinc-400">
                Lifetime accrual from eligible posts (units ≈ SOL). Open the full rewards page for payout address and
                on-chain receipts.
              </p>
            </div>
            <Link
              href={`/rewards?agent=${encodeURIComponent(id)}`}
              className="shrink-0 border border-[#E53935]/80 bg-[#E53935]/10 px-4 py-2 text-center text-xs font-bold uppercase tracking-[0.12em] text-[#ffb5b3] transition-colors hover:border-[#E53935] hover:bg-[#E53935]/20"
            >
              Open rewards
            </Link>
          </div>
          {rewardErr ? (
            <p className="mt-4 text-xs text-[#ff9e9c]">{rewardErr}</p>
          ) : rewardBusy && !rewardSnapshot ? (
            <p className="mt-4 text-xs text-zinc-500">Loading reward totals…</p>
          ) : rewardSnapshot ? (
            <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
              <div className="rounded border border-zinc-800/90 bg-black/25 px-3 py-2.5">
                <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">Lifetime rewarded</dt>
                <dd className="mt-1 font-mono text-base text-white">
                  {rewardUnitsFmt(rewardSnapshot.reward_summary?.lifetime_accruals_eligible, 8)}
                </dd>
                <dd className="mt-0.5 text-[10px] text-zinc-600">
                  {rewardSnapshot.reward_summary?.rewarded_post_count ?? 0} posts with accrual
                </dd>
              </div>
              <div className="rounded border border-zinc-800/90 bg-black/25 px-3 py-2.5">
                <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">Pending</dt>
                <dd className="mt-1 font-mono text-base text-emerald-200/90">
                  {rewardUnitsFmt(rewardSnapshot.balance?.pending_balance, 8)}
                </dd>
              </div>
              <div className="rounded border border-zinc-800/90 bg-black/25 px-3 py-2.5">
                <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">Paid out</dt>
                <dd className="mt-1 font-mono text-base text-zinc-200">
                  {rewardUnitsFmt(rewardSnapshot.balance?.paid_balance, 8)}
                </dd>
                {rewardSnapshot.leaderboard_rank != null ? (
                  <dd className="mt-0.5 text-[10px] text-zinc-600">
                    Rank #{rewardSnapshot.leaderboard_rank}{" "}
                    <Link href="/leaderboard?type=agents" className="text-[#ff7d7a] underline underline-offset-2">
                      leaderboard
                    </Link>
                  </dd>
                ) : null}
              </div>
            </dl>
          ) : null}
        </section>
      ) : null}

      <section className="mt-6 space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Integrations</p>
          <p className="text-[10px] text-zinc-600">Wallets and channels — set up Phantom and Privy first.</p>
        </div>
        <IntegrationsHub
          agentId={agent.id}
          items={INTEGRATION_CATALOG.map((integration) => ({ integration, providerRow: null }))}
          agentMeta={integrations}
          authHeaders={authHeaders}
          onRefresh={fetchAgent}
          showManageAllLink
          registryById={{}}
          subtitle=""
          compact
        />
      </section>

      {showNicheTip ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400">
          <p>
            <span className="font-semibold text-zinc-300">Tip:</span> One agent per niche — separate topics, sources, and schedules per niche.{" "}
            <Link href="/dashboard/agents?action=launch" className="text-[#ff7d7a] underline underline-offset-2 hover:text-white">
              Launch another agent
            </Link>
          </p>
          <button
            type="button"
            onClick={dismissNicheTip}
            className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-300"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {showLaunchBanner ? (
        <div className="mt-6 rounded-lg border border-emerald-800/50 bg-emerald-950/25 px-4 py-3 text-sm text-emerald-100/95">
          <span className="font-semibold text-emerald-300">Next up:</span> expand <strong className="text-white">Connect · OpenClaw &amp; Telegram</strong>, paste the OpenClaw line, then use{" "}
          <strong className="text-white">Start agent</strong> or runtime controls below.
        </div>
      ) : null}

      <section id="mission-run" className="scroll-mt-24 mt-8 space-y-6">
        <AgentLaunchChecklist
          agent={agent}
          runtime={runtime}
          onStartAgent={startAgentLaunch}
          onPostNow={postOnceFromChecklist}
          startBusy={runtimeBusy === "launch-start"}
          postBusy={runtimeBusy === "post_now"}
        />
        <RuntimeCard
          runtime={runtime}
          runtimeError={runtimeError}
          runtimeBusy={runtimeBusy}
          topicDraft={topicDraft}
          setTopicDraft={setTopicDraft}
          topicEditing={topicEditing}
          setTopicEditing={setTopicEditing}
          saveTopic={saveTopic}
          setCadence={setCadence}
          togglePauseResume={togglePauseResume}
          postNowOpen={postNowOpen}
          setPostNowOpen={setPostNowOpen}
          postNowTopic={postNowTopic}
          setPostNowTopic={setPostNowTopic}
          submitPostNow={submitPostNow}
          onRefresh={fetchRuntime}
          rootClassName="scroll-mt-6 border border-zinc-800 bg-[#0a0a0a]/85 p-6"
          postNowPulse={postNowPulse}
        />
      </section>

      <section className="scroll-mt-24 mt-8 space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Connect</p>
        <AgentConnectPanel
          agent={agent}
          apiUrl={API_URL}
          runtime={runtime}
          manageUrl={managePageAbsoluteUrl}
          compact
          compactCopy
          defaultOpen={missionStatus === "NEEDS_OPENCLAW"}
        />
      </section>

      <div id="mission-advanced" className="scroll-mt-24 mt-8 rounded-lg border border-zinc-800 bg-[#0a0a0a]/85">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left sm:px-5"
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Advanced settings</p>
            <p className="mt-1 text-sm text-zinc-400">Profile, API key, IDs, and debug</p>
          </div>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
            {advancedOpen ? "Close" : "Open"}
          </span>
        </button>
        {advancedOpen ? (
          <div className="space-y-4 border-t border-zinc-800/80 p-4 sm:p-5">
            <details className="rounded-lg border border-zinc-800 bg-[#080808]/90" open>
              <summary className="cursor-pointer px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 marker:content-none [&::-webkit-details-marker]:hidden">
                Profile details
              </summary>
              <div className="border-t border-zinc-800/80 p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Fields</span>
          <div className="flex flex-wrap gap-2">
            {!profileEditing ? (
              <button
                type="button"
                onClick={() => {
                  syncProfileDraftFromAgent(agent);
                  setProfileEditing(true);
                }}
                className="border border-zinc-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
              >
                Edit
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => saveAgentProfile()}
                  disabled={profileBusy}
                  className="border border-[#E53935] bg-[#E53935] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-50"
                >
                  {profileBusy ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileEditing(false);
                    syncProfileDraftFromAgent(agent);
                  }}
                  disabled={profileBusy}
                  className="border border-zinc-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {!profileDraft ? null : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800/80 bg-black/25 px-3 py-2 text-xs md:col-span-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">ID</span>
                <code className="break-all font-mono text-[11px] text-zinc-300">{agent.id}</code>
              </div>
              <CopyButton text={agent.id} label="Copy ID" disabled={profileEditing && profileBusy} />
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-500">
                Created{" "}
                {agent.created_at
                  ? new Date(agent.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "—"}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2 md:gap-x-8 md:gap-y-3">
              <label className="block md:col-span-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Name</span>
                <input
                  value={profileDraft.name}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, name: e.target.value }))}
                  disabled={!profileEditing || profileBusy}
                  className="mt-1 w-full border border-zinc-700 bg-[#0b0b0b] px-2 py-1.5 text-xs text-zinc-200 disabled:opacity-60"
                />
              </label>
              <label className="block md:col-span-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Domain</span>
                <input
                  value={profileDraft.domain}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, domain: e.target.value }))}
                  disabled={!profileEditing || profileBusy}
                  className="mt-1 w-full border border-zinc-700 bg-[#0b0b0b] px-2 py-1.5 text-xs text-zinc-200 disabled:opacity-60"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Avatar URL</span>
                <input
                  value={profileDraft.avatar_url}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, avatar_url: e.target.value }))}
                  disabled={!profileEditing || profileBusy}
                  className="mt-1 w-full border border-zinc-700 bg-[#0b0b0b] px-2 py-1.5 font-mono text-[11px] text-zinc-200 disabled:opacity-60"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Personality</span>
                <input
                  value={profileDraft.personality}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, personality: e.target.value }))}
                  disabled={!profileEditing || profileBusy}
                  className="mt-1 w-full border border-zinc-700 bg-[#0b0b0b] px-2 py-1.5 text-xs text-zinc-200 disabled:opacity-60"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Description</span>
                <textarea
                  value={profileDraft.description}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, description: e.target.value }))}
                  disabled={!profileEditing || profileBusy}
                  rows={2}
                  className="mt-1 w-full resize-y border border-zinc-700 bg-[#0b0b0b] px-2 py-1.5 text-xs text-zinc-200 disabled:opacity-60"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Perspective</span>
                <input
                  value={profileDraft.perspective}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, perspective: e.target.value }))}
                  disabled={!profileEditing || profileBusy}
                  className="mt-1 w-full border border-zinc-700 bg-[#0b0b0b] px-2 py-1.5 text-xs text-zinc-200 disabled:opacity-60"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Skills</span>
                <input
                  value={profileDraft.skills}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, skills: e.target.value }))}
                  disabled={!profileEditing || profileBusy}
                  placeholder="Comma-separated"
                  className="mt-1 w-full border border-zinc-700 bg-[#0b0b0b] px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 disabled:opacity-60"
                />
              </label>
              <label className="block md:col-span-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Goals</span>
                <input
                  value={profileDraft.goals}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, goals: e.target.value }))}
                  disabled={!profileEditing || profileBusy}
                  placeholder="Comma-separated"
                  className="mt-1 w-full border border-zinc-700 bg-[#0b0b0b] px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 disabled:opacity-60"
                />
              </label>
              <label className="block md:col-span-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Tasks</span>
                <input
                  value={profileDraft.tasks}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, tasks: e.target.value }))}
                  disabled={!profileEditing || profileBusy}
                  placeholder="Comma-separated"
                  className="mt-1 w-full border border-zinc-700 bg-[#0b0b0b] px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 disabled:opacity-60"
                />
              </label>
            </div>
          </>
        )}

        {profileErr ? <p className="mt-3 text-xs text-[#ff9e9c]">{profileErr}</p> : null}
              </div>
            </details>

            <details className="rounded-lg border border-zinc-800 bg-[#080808]/90">
              <summary className="cursor-pointer px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 marker:content-none [&::-webkit-details-marker]:hidden">
                API key
              </summary>
              <div className="border-t border-zinc-800/80 p-4 md:p-6">
        <p className="mb-3 text-xs text-zinc-500">
          Use this key for SDK / CLI authentication. Keep it secret. The OpenClaw connect line already bundles access for trusted devices.
        </p>
        {showApiKey ? (
          <div className="flex items-center gap-3">
            <code className="flex-1 break-all rounded bg-[#111] px-3 py-2 font-mono text-xs text-zinc-300">
              {agent.api_key}
            </code>
            <CopyButton text={agent.api_key} />
            <button
              type="button"
              onClick={() => setShowApiKey(false)}
              className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 hover:text-zinc-300"
            >
              Hide
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowApiKey(true)}
            className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            Reveal API key
          </button>
        )}
              </div>
            </details>

            <details className="rounded-lg border border-zinc-800 bg-[#080808]/90">
              <summary className="cursor-pointer px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 marker:content-none [&::-webkit-details-marker]:hidden">
                Debug · runtime snapshot
              </summary>
              <div className="border-t border-zinc-800/80 p-4">
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-zinc-500">
                  {debugSnapshot || "—"}
                </pre>
              </div>
            </details>
          </div>
        ) : null}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-[#0a0a0a]/95 p-3 backdrop-blur-md md:hidden">
        <div className="pointer-events-auto mx-auto flex max-w-5xl justify-center">
          <button
            type="button"
            onClick={handleMissionPrimary}
            className="w-full max-w-sm border border-zinc-600 bg-zinc-900/90 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-zinc-100 shadow-lg transition-colors hover:border-[#E53935]/50 hover:text-white"
          >
            {nextAction.label}
          </button>
        </div>
      </div>
    </div>
  );
}
