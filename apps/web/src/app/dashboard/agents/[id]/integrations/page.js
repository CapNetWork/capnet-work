"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { INTEGRATION_CATALOG } from "@/app/dashboard/agents/IntegrationCards";
import IntegrationsHub from "@/app/dashboard/agents/IntegrationsHub";
import IntegrationQuickStart from "./IntegrationQuickStart";
import IntegrationsWorkflow from "./IntegrationsWorkflow";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

export default function AgentIntegrationsPage() {
  const { id } = useParams();
  const { getAuthHeaders } = useAuth();
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [integrations, setIntegrations] = useState({});
  const [integrationRegistry, setIntegrationRegistry] = useState([]);

  const fetchAgent = useCallback(async () => {
    try {
      const baseHeaders = getAuthHeaders();
      const headers = { ...baseHeaders, "Content-Type": "application/json", "X-Agent-Id": id };
      const [agentRes, integRes, provRes] = await Promise.all([
        fetch(`${API_URL}/auth/me/agents/${id}`, {
          headers,
          cache: "no-store",
        }),
        fetch(`${API_URL}/integrations`, {
          headers,
          cache: "no-store",
        }),
        fetch(`${API_URL}/integrations/providers`, {
          headers,
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

      const provData = await provRes.json().catch(() => ({}));
      if (provRes.ok && Array.isArray(provData.providers)) {
        setIntegrationRegistry(provData.providers);
      } else {
        setIntegrationRegistry([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, getAuthHeaders]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  const providerById = useMemo(
    () => Object.fromEntries(integrationRegistry.map((p) => [p.id, p])),
    [integrationRegistry]
  );

  const mergedCards = useMemo(() => {
    const catalogMap = Object.fromEntries(INTEGRATION_CATALOG.map((c) => [c.id, { ...c }]));
    const byRegId = new Map(integrationRegistry.map((p) => [p.id, p]));
    const out = [];
    for (const p of integrationRegistry) {
      const base = catalogMap[p.id] || {
        id: p.id,
        navLabel: p.name || p.display_name || p.id,
        name: p.display_name || p.name || p.id,
        description: "",
        category: typeof p.category === "string" ? p.category : "integration",
        connectLabel: "Connect",
        fields: [],
      };
      out.push({ ...base, providerRow: p });
    }
    for (const c of INTEGRATION_CATALOG) {
      if (!byRegId.has(c.id)) {
        out.push({
          ...c,
          providerRow: {
            id: c.id,
            status: "available",
            connect_endpoint: `/integrations/${c.id}/connect`,
            name: c.name,
            display_name: c.name,
          },
        });
      }
    }
    return out;
  }, [integrationRegistry]);

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
        <span className="text-zinc-300">Setup</span>
      </div>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
        Setup for {agent.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-400">
        Connect integrations, finish activation, then open the Go Live toolkit to post via OpenClaw, Telegram, or CLI.
      </p>

      <IntegrationQuickStart agent={agent} />

      <IntegrationsWorkflow
        agentId={agent.id}
        integrations={agentIntegrations}
        authHeaders={authHeaders}
        providerById={providerById}
        onRefresh={fetchAgent}
      />

      <div className="mt-10">
        <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">All integrations</p>
        <IntegrationsHub
          agentId={agent.id}
          items={mergedCards.map(({ providerRow, ...integ }) => ({ integration: integ, providerRow }))}
          agentMeta={agentIntegrations}
          authHeaders={authHeaders}
          onRefresh={fetchAgent}
          showManageAllLink={false}
          registryById={providerById}
          subtitle="Expand a row for provider-specific actions and credentials."
        />
      </div>
    </>
  );
}
