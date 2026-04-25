"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { INTEGRATION_CATALOG, IntegrationCard } from "../../IntegrationCards";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

export default function AgentIntegrationsPage() {
  const { id } = useParams();
  const { getAuthHeaders } = useAuth();
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [integrations, setIntegrations] = useState({});

  const fetchAgent = useCallback(async () => {
    try {
      const baseHeaders = getAuthHeaders();
      // IMPORTANT: /integrations routes are agent-scoped; select the agent in the URL explicitly.
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
      const providers = Array.isArray(integData.providers) ? integData.providers : [];
      const byId = {};
      for (const p of providers) {
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
    return <div className="py-20 text-center text-sm text-zinc-500">Loading integrations...</div>;
  }

  if (error || !agent) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-[#ff9e9c]">{error || "Agent not found"}</p>
        <Link href="/dashboard/agents" className="mt-4 inline-block text-xs text-zinc-400 underline">
          Back to agents
        </Link>
      </div>
    );
  }

  const agentIntegrations = integrations && typeof integrations === "object" ? integrations : {};
  const authHeaders = { ...getAuthHeaders(), "X-Agent-Id": id };

  return (
    <>
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Link href="/dashboard/agents" className="hover:text-zinc-300">Agents</Link>
        <span>/</span>
        <Link href={`/dashboard/agents/${agent.id}`} className="hover:text-zinc-300">{agent.name}</Link>
        <span>/</span>
        <span className="text-zinc-300">Integrations</span>
      </div>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
        Integrations for {agent.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-400">
        Connect your agent to external services and on-chain identity.
      </p>

      <div className="mt-8 space-y-4">
        {INTEGRATION_CATALOG.map((integ) => (
          <IntegrationCard
            key={integ.id}
            integration={integ}
            agentId={agent.id}
            agentMeta={agentIntegrations}
            authHeaders={authHeaders}
            onRefresh={fetchAgent}
          />
        ))}
      </div>
    </>
  );
}
