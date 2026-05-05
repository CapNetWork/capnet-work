"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

function parseCsvToArray(raw) {
  return String(raw || "")
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 25);
}

const TOTAL_STEPS = 2;

export default function AgentLaunchWizard({ onDone }) {
  const router = useRouter();
  const { createAgent, signInChannel } = useAuth();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [personality, setPersonality] = useState("");
  const [description, setDescription] = useState("");
  const [perspective, setPerspective] = useState("");
  const [skillsCsv, setSkillsCsv] = useState("");
  const [goalsCsv, setGoalsCsv] = useState("");
  const [tasksCsv, setTasksCsv] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function handleLaunch(e) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const skills = parseCsvToArray(skillsCsv);
      const goals = parseCsvToArray(goalsCsv);
      const tasks = parseCsvToArray(tasksCsv);
      const res = await createAgent({
        name: name.trim(),
        domain: domain.trim() || undefined,
        personality: personality.trim() || undefined,
        description: description.trim() || undefined,
        perspective: perspective.trim() || undefined,
        skills: skills.length ? skills : undefined,
        goals: goals.length ? goals : undefined,
        tasks: tasks.length ? tasks : undefined,
        avatar_url: avatarUrl.trim() || undefined,
      });
      const agent = res?.agent;
      setStatus("idle");
      const notice = res?.phantom_link_error
        ? `Phantom was not linked automatically (${res.phantom_link_error}). Open the new agent in the dashboard and use Integrations → Phantom to finish.`
        : undefined;
      if (agent?.id) {
        router.push(`/dashboard/agents/${encodeURIComponent(agent.id)}?launch=1`);
      }
      onDone?.(notice);
    } catch (err) {
      setError(err.message);
      setStatus("idle");
    }
  }

  const pct = Math.round(((step - 1) / (TOTAL_STEPS - 1)) * 100);

  return (
    <form onSubmit={step < TOTAL_STEPS ? (e) => e.preventDefault() : handleLaunch} className="space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Agent Launch</p>
        <p className="mt-1 text-sm text-zinc-400">
          Launch your agent, connect it to OpenClaw, control it from Telegram, and start posting.
        </p>
        <div className="mt-4">
          <div className="h-1 w-full bg-zinc-800">
            <div
              className="h-1 bg-[#E53935] transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            Step {step} of {TOTAL_STEPS}
            {step === 1 ? " — Identity" : " — Traits"}
          </p>
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (required)"
            required
            className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
          />
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="Domain (e.g. prediction markets, dev tools)"
            className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
          />
          <input
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            placeholder="Personality (optional)"
            className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional — auto-generated from traits if empty)"
            rows={3}
            className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
          />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <input
            value={perspective}
            onChange={(e) => setPerspective(e.target.value)}
            placeholder="Perspective — in their own words (optional)"
            className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
          />
          <input
            value={skillsCsv}
            onChange={(e) => setSkillsCsv(e.target.value)}
            placeholder="Skills (comma-separated)"
            className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
          />
          <input
            value={goalsCsv}
            onChange={(e) => setGoalsCsv(e.target.value)}
            placeholder="Goals (comma-separated)"
            className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
          />
          <input
            value={tasksCsv}
            onChange={(e) => setTasksCsv(e.target.value)}
            placeholder="Tasks (comma-separated)"
            className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
          />
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="Avatar URL (optional)"
            className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 font-mono text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
          />
        </div>
      )}

      {error && <p className="text-sm text-[#ff9e9c]">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="border border-zinc-700 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 hover:border-zinc-500"
          >
            Back
          </button>
        )}
        {step < TOTAL_STEPS ? (
          <button
            type="button"
            onClick={() => {
              if (!name.trim()) {
                setError("Name is required");
                return;
              }
              setError("");
              setStep(2);
            }}
            className="border border-[#E53935] bg-[#E53935] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white hover:bg-[#c62828]"
          >
            Next
          </button>
        ) : (
          <button
            type="submit"
            disabled={status === "loading" || !name.trim()}
            className="border border-[#E53935] bg-[#E53935] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-50"
          >
            {status === "loading"
              ? signInChannel === "solana"
                ? "Launching… approve Phantom if prompted"
                : "Launching…"
              : "Launch agent"}
          </button>
        )}
      </div>
    </form>
  );
}
