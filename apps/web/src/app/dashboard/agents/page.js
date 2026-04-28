"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

function CreateAgentForm({ onDone }) {
  const { createAgent } = useAuth();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [personality, setPersonality] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      await createAgent({ name, domain: domain || undefined, personality: personality || undefined, description: description || undefined });
      setName("");
      setDomain("");
      setPersonality("");
      setDescription("");
      setStatus("idle");
      onDone?.();
    } catch (err) {
      setError(err.message);
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Agent name (required)"
        required
        className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
      />
      <input
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        placeholder="Domain (optional, e.g. finance, art, dev)"
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
        placeholder="Description (optional)"
        rows={3}
        className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
      />
      {error && <p className="text-sm text-[#ff9e9c]">{error}</p>}
      <button
        type="submit"
        disabled={status === "loading" || !name.trim()}
        className="w-full border border-[#E53935] bg-[#E53935] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-50"
      >
        {status === "loading" ? "Creating..." : "Create agent"}
      </button>
    </form>
  );
}

function LinkAgentForm({ onDone }) {
  const { linkAgent } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      await linkAgent(apiKey);
      setApiKey("");
      setStatus("idle");
      onDone?.();
    } catch (err) {
      setError(err.message);
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="Paste agent API key (capnet_sk_...)"
        required
        className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 font-mono text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
      />
      {error && <p className="text-sm text-[#ff9e9c]">{error}</p>}
      <button
        type="submit"
        disabled={status === "loading" || !apiKey.trim()}
        className="w-full border border-zinc-700 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-[#E53935]/50 hover:text-white disabled:opacity-50"
      >
        {status === "loading" ? "Linking..." : "Link agent"}
      </button>
    </form>
  );
}

export default function AgentsPage() {
  const { agents, activeAgent, selectAgent } = useAuth();
  const searchParams = useSearchParams();
  const initialAction = searchParams.get("action");
  const [showCreate, setShowCreate] = useState(initialAction === "create");
  const [showLink, setShowLink] = useState(initialAction === "link");

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Agents</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {agents.length} agent{agents.length !== 1 ? "s" : ""} registered to your account. Tip: use a separate agent per niche so each can own its sources, Telegram command bundle, and CLI runner.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setShowCreate((v) => !v); setShowLink(false); }}
            className={`border px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition-colors ${
              showCreate
                ? "border-[#E53935] bg-[#E53935]/15 text-[#ffb5b3]"
                : "border-[#E53935] bg-[#E53935] text-white hover:bg-[#c62828]"
            }`}
          >
            {showCreate ? "Cancel" : "Create"}
          </button>
          <button
            type="button"
            onClick={() => { setShowLink((v) => !v); setShowCreate(false); }}
            className={`border px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition-colors ${
              showLink
                ? "border-zinc-500 bg-zinc-800 text-zinc-200"
                : "border-zinc-700 text-zinc-300 hover:border-[#E53935]/50 hover:text-white"
            }`}
          >
            {showLink ? "Cancel" : "Link"}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="mt-6 border border-zinc-800 bg-[#0a0a0a]/85 p-6">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Create new agent</p>
          <CreateAgentForm onDone={() => setShowCreate(false)} />
        </div>
      )}

      {showLink && (
        <div className="mt-6 border border-zinc-800 bg-[#0a0a0a]/85 p-6">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Link existing agent by API key</p>
          <LinkAgentForm onDone={() => setShowLink(false)} />
        </div>
      )}

      {agents.length === 0 && !showCreate && !showLink ? (
        <div className="mt-8 border border-dashed border-zinc-700 bg-[#0a0a0a]/50 p-10 text-center">
          <p className="text-sm text-zinc-400">No agents yet. Create one or link an existing agent with its API key.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`flex items-center justify-between gap-4 border bg-[#0a0a0a]/85 p-5 transition-colors ${
                agent.id === activeAgent?.id
                  ? "border-[#E53935]/30"
                  : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <Link
                href={`/dashboard/agents/${agent.id}/wallet`}
                className="group min-w-0 flex-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#E53935]/60"
                aria-label={`Open ${agent.name}'s wallet activity`}
              >
                <div className="flex items-center gap-3">
                  <p className="text-base font-semibold text-white transition-colors group-hover:text-[#ff7d7a]">
                    {agent.name}
                  </p>
                  {agent.id === activeAgent?.id && (
                    <span className="border border-[#E53935]/40 bg-[#E53935]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#ffb5b3]">
                      Active
                    </span>
                  )}
                </div>
                {agent.domain && (
                  <p className="mt-0.5 text-xs text-zinc-500">{agent.domain}</p>
                )}
                {agent.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{agent.description}</p>
                )}
                <p className="mt-2 font-mono text-[11px] text-zinc-600">{agent.id}</p>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                {agent.id !== activeAgent?.id && (
                  <button
                    type="button"
                    onClick={() => selectAgent(agent.id)}
                    className="border border-zinc-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
                  >
                    Set active
                  </button>
                )}
                <Link
                  href={`/dashboard/agents/${agent.id}`}
                  className="border border-zinc-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-300 transition-colors hover:border-[#E53935]/50 hover:text-white"
                >
                  Manage
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
