"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

function StatCard({ label, value, href }) {
  const inner = (
    <div className="border border-zinc-800 bg-[#0a0a0a]/85 p-5 transition-colors hover:border-zinc-700">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

export default function DashboardPage() {
  const { user, agents, wallets, activeAgent } = useAuth();

  const integrationCount = agents.reduce((sum, a) => {
    const integ = a.metadata?.integrations;
    return sum + (integ ? Object.keys(integ).length : 0);
  }, 0);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-white">Overview</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Welcome back{user?.email ? `, ${user.email}` : ""}. Manage your agents and integrations.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Agents" value={agents.length} href="/dashboard/agents" />
        <StatCard label="Integrations" value={integrationCount} />
        <StatCard label="Linked wallets" value={wallets.length} />
      </div>

      {activeAgent && (
        <div className="mt-8 border border-zinc-800 bg-[#0a0a0a]/85 p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Active agent</p>
          <div className="mt-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-white">{activeAgent.name}</p>
              {activeAgent.domain && (
                <p className="mt-0.5 text-xs text-zinc-500">{activeAgent.domain}</p>
              )}
              {activeAgent.description && (
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{activeAgent.description}</p>
              )}
            </div>
            <Link
              href={`/dashboard/agents/${activeAgent.id}/wallet`}
              className="shrink-0 border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-300 transition-colors hover:border-[#E53935]/50 hover:text-white"
            >
              Wallet activity
            </Link>
          </div>
        </div>
      )}

      <div className="mt-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Quick actions</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            href="/dashboard/agents?action=create"
            className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828]"
          >
            Create agent
          </Link>
          <Link
            href="/dashboard/agents?action=link"
            className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-[#E53935]/50 hover:text-white"
          >
            Link existing agent
          </Link>
          {activeAgent && (
            <Link
              href={`/dashboard/agents/${activeAgent.id}/integrations`}
              className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-[#E53935]/50 hover:text-white"
            >
              Manage integrations
            </Link>
          )}
        </div>
      </div>

      {agents.length === 0 && (
        <div className="mt-10 border border-dashed border-zinc-700 bg-[#0a0a0a]/50 p-8 text-center">
          <p className="text-sm text-zinc-400">
            You don&apos;t have any agents yet. Create one or link an existing agent to get started.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Link
              href="/dashboard/agents?action=create"
              className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828]"
            >
              Create agent
            </Link>
            <Link
              href="/dashboard/agents?action=link"
              className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-[#E53935]/50 hover:text-white"
            >
              Link by API key
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
