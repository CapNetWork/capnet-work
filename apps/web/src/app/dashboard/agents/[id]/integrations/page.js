"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

const INTEGRATION_CATALOG = [
  {
    id: "erc8004",
    name: "ERC-8004 Identity",
    description: "Mint an on-chain identity anchor for your agent on Base. Proves ownership and enables verifiable agent identity.",
    category: "Identity",
    connectLabel: "Mint identity",
    fields: [
      { key: "owner_wallet", label: "Owner wallet", placeholder: "0x... wallet address that will own the token" },
    ],
  },
  {
    id: "bankr",
    name: "Bankr",
    description: "Connect a Bankr API key to unlock rewards scoring and payout workflows for quality posts.",
    category: "Rewards",
    connectLabel: "Connect Bankr",
    fields: [
      { key: "api_key", label: "Bankr API key", placeholder: "Your Bankr API key" },
    ],
  },
  {
    id: "privy_wallet",
    name: "Privy Wallet (Solana)",
    description:
      "Generate an agent-controlled Solana wallet via Privy custody. Enables signing and sending Solana transactions from CapNet.",
    category: "Wallet",
    connectLabel: "Generate wallet",
    fields: [
      { key: "label", label: "Label (optional)", placeholder: "e.g. treasury, payouts, ops" },
    ],
  },
  {
    id: "phantom_wallet",
    name: "Phantom (Solana)",
    description:
      "Link a Phantom Solana wallet by public key (user-owned). Server-side signing is not available until a client flow is wired.",
    category: "Wallet",
    connectLabel: "Link wallet",
    fields: [
      { key: "wallet_address", label: "Solana address", placeholder: "Base58 public key from Phantom" },
      { key: "label", label: "Label (optional)", placeholder: "e.g. trading" },
    ],
  },
  {
    id: "moonpay",
    name: "MoonPay",
    description:
      "Fiat on/off ramps via MoonPay. Connect stores defaults; use POST /integrations/moonpay/widget-url with currencyCode for a signed buy URL (API keys on server).",
    category: "Payments",
    connectLabel: "Enable MoonPay",
    fields: [
      { key: "default_currency_code", label: "Default currency (optional)", placeholder: "e.g. sol, eth, usdc" },
      { key: "default_wallet_address", label: "Default wallet (optional)", placeholder: "Address to receive crypto" },
    ],
  },
];

function IntegrationCard({ integration, agentId, agentMeta, authHeaders, onRefresh }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [formValues, setFormValues] = useState({});
  const [showForm, setShowForm] = useState(false);

  const currentStatus = agentMeta?.[integration.id];
  const isConnected = currentStatus?.connected === true;
  const statusRows =
    isConnected && currentStatus && typeof currentStatus === "object"
      ? Object.entries(currentStatus).filter(([key, val]) => key !== "connected" && val != null && val !== "")
      : [];

  function updateField(key, val) {
    setFormValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleConnect(e) {
    e.preventDefault();
    setConnecting(true);
    setError("");
    try {
      const path = integration.connectPath || `/integrations/${integration.id}/connect`;
      const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(formValues),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      setShowForm(false);
      setFormValues({});
      onRefresh?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="border border-zinc-800 bg-[#0a0a0a]/85 p-6 transition-colors hover:border-zinc-700">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-white">{integration.name}</h3>
            <span className="border border-zinc-600 bg-zinc-800/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-400">
              {integration.category}
            </span>
            {isConnected && (
              <span className="border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300">
                Connected
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{integration.description}</p>
        </div>
      </div>

      {statusRows.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-zinc-800/50 pt-4">
          {statusRows.map(([key, val]) => (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">{key.replace(/_/g, " ")}</span>
              <span className="max-w-[60%] truncate text-right font-mono text-zinc-300">{String(val)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        {!isConnected && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828]"
          >
            {integration.connectLabel}
          </button>
        )}

        {showForm && (
          <form onSubmit={handleConnect} className="mt-2 space-y-3 border-t border-zinc-800/50 pt-4">
            {integration.fields.map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                  {field.label}
                </label>
                <input
                  value={formValues[field.key] || ""}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
                />
              </div>
            ))}
            {error && <p className="text-sm text-[#ff9e9c]">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={connecting}
                className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-50"
              >
                {connecting ? "Connecting..." : integration.connectLabel}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setError(""); }}
                className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {isConnected && integration.id === "erc8004" && currentStatus.verification_status !== "verified" && (
          <VerifyButton agentId={agentId} authHeaders={authHeaders} onRefresh={onRefresh} />
        )}
      </div>
    </div>
  );
}

function VerifyButton({ agentId, authHeaders, onRefresh }) {
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  async function handleVerify() {
    setVerifying(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/integrations/erc8004/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      onRefresh?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleVerify}
        disabled={verifying}
        className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-300 transition-colors hover:border-[#E53935]/50 hover:text-white disabled:opacity-50"
      >
        {verifying ? "Verifying..." : "Verify on-chain"}
      </button>
      {error && <p className="mt-2 text-xs text-[#ff9e9c]">{error}</p>}
    </div>
  );
}

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
