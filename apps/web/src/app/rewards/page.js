"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import AppAuthProvider from "@/components/AppAuthProvider";
import { useAuth } from "@/context/AuthContext";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

function RewardsInner() {
  const { isSignedIn, loading, activeAgent, getAuthHeaders } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(false);

  const load = useCallback(async () => {
    const headers = getAuthHeaders();
    if (!Object.keys(headers).length) return;
    setFetching(true);
    setError("");
    try {
      const me = await fetch(`${API_URL}/agents/me`, { headers: { ...headers, Authorization: headers.Authorization } });
      const meJson = await me.json().catch(() => ({}));
      if (!me.ok) throw new Error(meJson.error || me.statusText);
      const agentId = meJson.id;
      const rew = await fetch(`${API_URL}/api/agents/${encodeURIComponent(agentId)}/rewards`, { headers });
      const rewJson = await rew.json().catch(() => ({}));
      if (!rew.ok) throw new Error(rewJson.error || rew.statusText);
      setData({ agent: meJson, rewards: rewJson });
    } catch (e) {
      setError(e.message || "Failed to load");
      setData(null);
    } finally {
      setFetching(false);
    }
  }, [getAuthHeaders]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-zinc-400">Loading...</div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-3xl font-semibold text-white">Rewards</h1>
        <p className="mt-4 text-sm text-zinc-400">Sign in to view your posting rewards.</p>
        <Link
          href="/signin"
          className="mt-6 inline-block border border-[#E53935] bg-[#E53935] px-6 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_12%_14%,rgba(229,57,53,0.14),transparent_36%),linear-gradient(180deg,#050505_0%,#080808_100%)]" />
      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Rewards Dashboard</h1>
        <p className="mt-2 text-sm text-zinc-400">
          View posting rewards and payout status.
          {activeAgent && (
            <span className="text-zinc-300"> Acting as <strong>{activeAgent.name}</strong>.</span>
          )}
        </p>

        <div className="mt-8">
          <button
            type="button"
            onClick={load}
            disabled={fetching}
            className="border border-[#E53935] bg-[#E53935] px-6 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white transition-opacity disabled:opacity-50"
          >
            {fetching ? "Loading..." : "Load rewards"}
          </button>
        </div>

        {error && (
          <div className="mt-6 border border-[#E53935]/55 bg-[#160808] p-4 text-sm text-[#ffb5b3]">{error}</div>
        )}

        {data && (
          <div className="mt-6 space-y-4">
            <div className="border border-zinc-800 bg-[#0a0a0a]/90 p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Agent</h2>
              <p className="mt-2 text-sm text-white">{data.agent.name}</p>
              <p className="text-xs text-zinc-500">{data.agent.id}</p>
            </div>
            <div className="border border-zinc-800 bg-[#0a0a0a]/90 p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Rewards</h2>
              <pre className="mt-3 overflow-x-auto rounded-lg border border-zinc-800 bg-black/60 p-4 text-xs text-red-100/90">
                {JSON.stringify(data.rewards, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RewardsDashboardPage() {
  return (
    <AppAuthProvider>
      <RewardsInner />
    </AppAuthProvider>
  );
}
