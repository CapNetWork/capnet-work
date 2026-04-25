"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { INTEGRATION_CATALOG, IntegrationCard } from "../IntegrationCards";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="border border-zinc-700 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
    >
      {copied ? "Copied" : label || "Copy"}
    </button>
  );
}

function FieldRow({ label, value, mono, copyable }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-800/50 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
        <p className={`mt-1 text-sm text-zinc-200 ${mono ? "break-all font-mono text-xs" : ""}`}>
          {value}
        </p>
      </div>
      {copyable && <CopyButton text={String(value)} />}
    </div>
  );
}

export default function AgentDetailPage() {
  const { id } = useParams();
  const { getAuthHeaders } = useAuth();
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [integrations, setIntegrations] = useState({});

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

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

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
  const authHeaders = { ...getAuthHeaders(), "X-Agent-Id": id };
  const byCategory = INTEGRATION_CATALOG.reduce((acc, integ) => {
    const key = integ.category || "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(integ);
    return acc;
  }, {});

  return (
    <>
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Link href="/dashboard/agents" className="hover:text-zinc-300">Agents</Link>
        <span>/</span>
        <span className="text-zinc-300">{agent.name}</span>
      </div>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">{agent.name}</h1>
          {agent.domain && (
            <p className="mt-1 text-sm text-zinc-400">{agent.domain}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href="#integrations"
            className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#c62828]"
          >
            Integrations{connectedIntegrationCount > 0 ? ` (${connectedIntegrationCount})` : ""}
          </Link>
          <Link
            href={`/agent/${encodeURIComponent(agent.name)}`}
            className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-300 transition-colors hover:border-[#E53935]/50 hover:text-white"
          >
            Public profile
          </Link>
        </div>
      </div>

      <div className="mt-8 border border-zinc-800 bg-[#0a0a0a]/85 p-6">
        <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Agent details</p>
        <FieldRow label="ID" value={agent.id} mono copyable />
        <FieldRow label="Name" value={agent.name} />
        <FieldRow label="Domain" value={agent.domain} />
        <FieldRow label="Personality" value={agent.personality} />
        <FieldRow label="Description" value={agent.description} />
        <FieldRow label="Perspective" value={agent.perspective} />
        {agent.skills?.length > 0 && (
          <FieldRow label="Skills" value={agent.skills.join(", ")} />
        )}
        {agent.goals?.length > 0 && (
          <FieldRow label="Goals" value={agent.goals.join(", ")} />
        )}
        <FieldRow label="Created" value={new Date(agent.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} />
      </div>

      <div className="mt-6 border border-zinc-800 bg-[#0a0a0a]/85 p-6">
        <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">API key</p>
        <p className="mb-3 text-xs text-zinc-500">
          Use this key for SDK / CLI authentication. Keep it secret.
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

      <section id="integrations" className="mt-6">
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Integrations</p>
          <p className="mt-1 text-sm text-zinc-400">
            Connect this agent to wallets, payments, and on-chain identity without leaving the manage page.
          </p>
        </div>
        <div className="space-y-8">
          {Object.entries(byCategory).map(([cat, items]) => (
            <div key={cat}>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{cat}</p>
              <div className="space-y-4">
                {items.map((integ) => (
                  <IntegrationCard
                    key={integ.id}
                    integration={integ}
                    agentId={agent.id}
                    agentMeta={integrations}
                    authHeaders={authHeaders}
                    onRefresh={fetchAgent}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
