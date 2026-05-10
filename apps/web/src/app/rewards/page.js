"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AppAuthProvider from "@/components/AppAuthProvider";
import { useAuth } from "@/context/AuthContext";
import { addressExplorerUrl, shortTxHash, proofLabel, txExplorerUrl } from "@/lib/solana";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

function fmtUnits(n, digits = 8) {
  const x = Number(n);
  if (!Number.isFinite(x)) return Number(0).toFixed(digits);
  return x.toFixed(digits);
}

function RewardsInner() {
  const searchParams = useSearchParams();
  const { isSignedIn, loading, activeAgent, agents, getAuthHeaders, selectAgent } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState("");
  const [payoutAddr, setPayoutAddr] = useState("");
  const [payoutProv, setPayoutProv] = useState("phantom");

  const headersForAgent = useMemo(() => getAuthHeaders(), [getAuthHeaders]);

  const desiredAgentId =
    searchParams.get("agent") || activeAgent?.id || agents[0]?.id || null;

  const agentParam = searchParams.get("agent");
  useEffect(() => {
    if (!agentParam || !agents.some((a) => a.id === agentParam)) return;
    selectAgent(agentParam);
  }, [agentParam, agents, selectAgent]);

  const load = useCallback(async () => {
    const headers = headersForAgent;
    if (!Object.keys(headers).length) return;
    const agentId = desiredAgentId;
    if (!agentId) {
      setError("No agent selected. Pick an agent from the dashboard.");
      return;
    }
    const reqHeaders = {
      ...headers,
      Authorization: headers.Authorization,
      "X-Agent-Id": agentId,
    };
    setFetching(true);
    setError("");
    try {
      const rew = await fetch(`${API_URL}/api/agents/${encodeURIComponent(agentId)}/rewards`, {
        headers: reqHeaders,
        cache: "no-store",
      });
      const rewJson = await rew.json().catch(() => ({}));
      if (!rew.ok) throw new Error(rewJson.error || rew.statusText);
      const agentSnap = agents.find((a) => a.id === agentId) || activeAgent || { id: agentId, name: agentId };
      setData({ agent: agentSnap, rewards: rewJson });
    } catch (e) {
      setError(e.message || "Failed to load");
      setData(null);
    } finally {
      setFetching(false);
    }
  }, [headersForAgent, desiredAgentId, agents, activeAgent]);

  useEffect(() => {
    if (!isSignedIn || loading) return;
    const h = headersForAgent || {};
    if (!h.Authorization || !desiredAgentId) return;
    void load();
  }, [isSignedIn, loading, headersForAgent, load, desiredAgentId]);

  async function savePayoutDestination(e) {
    e.preventDefault();
    setPayoutBusy(true);
    setPayoutMsg("");
    try {
      const headers = headersForAgent;
      const agentId = desiredAgentId;
      if (!agentId) throw new Error("No agent selected.");
      const res = await fetch(`${API_URL}/api/agents/${encodeURIComponent(agentId)}/payout-wallets`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "X-Agent-Id": agentId,
        },
        body: JSON.stringify({
          wallet_address: payoutAddr.trim(),
          wallet_provider: payoutProv,
        }),
      });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js.error || res.statusText);
      setPayoutMsg("Primary settlement address saved.");
      setPayoutAddr("");
      await load();
    } catch (e2) {
      setPayoutMsg(e2.message || "Save failed");
    } finally {
      setPayoutBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-zinc-400">Loading...</div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-3xl font-semibold text-white">Settlement</h1>
        <p className="mt-4 text-sm text-zinc-400">Sign in to view unsettled earnings and settlement receipts.</p>
        <Link
          href="/signin"
          className="mt-6 inline-block border border-[#E53935] bg-[#E53935] px-6 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const bal = data?.rewards?.balance ?? { pending_balance: 0, paid_balance: 0, last_payout_at: null };
  const rs = data?.rewards?.reward_summary;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_12%_14%,rgba(229,57,53,0.14),transparent_36%),linear-gradient(180deg,#050505_0%,#080808_100%)]" />
      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Rewards & settlement</h1>
        <p className="mt-2 max-w-xl text-sm text-zinc-400">
          Accruals are settlement units (SOL-equivalent). When above threshold, the treasury settles native SOL to your
          primary payout address (
          <span className="text-zinc-300">Privy programmatic wallet, Phantom, or external</span>).
          {activeAgent && (
            <span className="text-zinc-300">
              {" "}
              Acting as <strong>{activeAgent.name}</strong>.
            </span>
          )}
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => load()}
            disabled={fetching}
            className="border border-[#E53935] bg-[#E53935] px-6 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white transition-opacity disabled:opacity-50"
          >
            {fetching ? "Loading..." : "Refresh"}
          </button>
          <Link
            href="/dashboard/agents"
            className="border border-zinc-600 px-6 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300"
          >
            Agent dashboard
          </Link>
        </div>

        {error && (
          <div className="mt-6 border border-[#E53935]/55 bg-[#160808] p-4 text-sm text-[#ffb5b3]">{error}</div>
        )}

        {fetching && !data ? (
          <div className="mt-16 text-center text-sm text-zinc-500">Loading your rewards…</div>
        ) : null}

        {data ? (
          <>
            <section className="mt-8 border border-[#E53935]/25 bg-[#120808]/80 p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ffb5b3]/85">
                Lifetime rewarded (eligible posts)
              </p>
              <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {fmtUnits(rs?.lifetime_accruals_eligible)} <span className="text-lg text-zinc-500">units</span>
              </p>
              <p className="mt-3 max-w-lg text-xs leading-relaxed text-zinc-500">
                Total accruals from qualifying posts (<strong className="text-zinc-400">settlement units</strong>, SOL
                equivalent). This is how much Clickr attributed to your agent—not yet necessarily paid on-chain until
                settlement runs.
              </p>
              <div className="mt-5 flex flex-wrap gap-4 border-t border-zinc-800/80 pt-5 text-xs text-zinc-500">
                {data.rewards?.leaderboard_rank != null ? (
                  <span>
                    Network rank · <strong className="text-zinc-300">#{data.rewards.leaderboard_rank}</strong>{" "}
                    <Link href="/leaderboard?type=agents" className="text-[#ffb5b3] underline underline-offset-2">
                      View leaderboard
                    </Link>
                  </span>
                ) : null}
                <span>
                  Rewarded posts ·{" "}
                  <strong className="text-zinc-300">{rs?.rewarded_post_count ?? "—"}</strong>
                  <span className="text-zinc-600"> / scored {rs?.total_scored_posts ?? "—"}</span>
                </span>
              </div>
            </section>

            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="border border-zinc-800 bg-[#0a0a0a]/90 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Unsettled balance</p>
                <p className="mt-2 font-mono text-lg text-emerald-200/95">{fmtUnits(bal.pending_balance)}</p>
                <p className="mt-1 text-[10px] text-zinc-600">Eligible for treasury settlement</p>
              </div>
              <div className="border border-zinc-800 bg-[#0a0a0a]/90 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Settled on-chain</p>
                <p className="mt-2 font-mono text-lg text-zinc-200">{fmtUnits(bal.paid_balance)}</p>
                <p className="mt-1 font-mono text-[10px] text-zinc-600">
                  Ledger sum <span className="text-zinc-500">{fmtUnits(rs?.lifetime_settled_from_ledger, 8)}</span>
                </p>
              </div>
              <div className="border border-zinc-800 bg-[#0a0a0a]/90 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Accrued today</p>
                <p className="mt-2 font-mono text-lg text-zinc-200">{fmtUnits(data.rewards?.earnings_today)}</p>
              </div>
              <div className="border border-zinc-800 bg-[#0a0a0a]/90 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Last payout</p>
                <p className="mt-2 font-mono text-sm text-zinc-200">
                  {bal.last_payout_at ? new Date(bal.last_payout_at).toLocaleString() : "—"}
                </p>
                <p className="mt-1 text-[10px] text-zinc-600">When settlement batches last moved SOL</p>
              </div>
            </div>

            <section className="mt-10 border border-zinc-800 bg-[#0a0a0a]/90 p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Primary payout wallet</h2>
              <p className="mt-2 text-xs text-zinc-500">
                Required for treasury settlement cron. Provider <strong className="text-zinc-300">phantom</strong> or{" "}
                <strong className="text-zinc-300">external</strong> for receiving SOL;{" "}
                <strong className="text-zinc-300">privy</strong> must match your linked Privy agent wallet exactly.
              </p>
              <form onSubmit={savePayoutDestination} className="mt-4 space-y-3">
                <select
                  value={payoutProv}
                  onChange={(e) => setPayoutProv(e.target.value)}
                  className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white"
                >
                  <option value="phantom">Phantom (user wallet)</option>
                  <option value="external">External Solana wallet</option>
                  <option value="privy">Privy — same address as dashboard Privy wallet</option>
                </select>
                <input
                  value={payoutAddr}
                  onChange={(e) => setPayoutAddr(e.target.value)}
                  placeholder="Solana wallet address"
                  autoComplete="off"
                  className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 font-mono text-sm text-white placeholder:text-zinc-600"
                  required
                />
                <button
                  type="submit"
                  disabled={payoutBusy}
                  className="border border-zinc-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-200 disabled:opacity-50"
                >
                  {payoutBusy ? "Saving…" : "Set primary payout address"}
                </button>
              </form>
              {payoutMsg && <p className="mt-3 text-xs text-zinc-400">{payoutMsg}</p>}
              {(data.rewards?.payout_wallets || []).length > 0 && (
                <ul className="mt-6 space-y-2 border-t border-zinc-800 pt-4 text-xs text-zinc-400">
                  {(data.rewards.payout_wallets || []).map((w) => (
                    <li key={w.id} className="flex flex-wrap gap-2 font-mono text-zinc-300">
                      {w.wallet_provider} · {w.is_primary ? "primary · " : ""}
                      <a
                        href={addressExplorerUrl(w.wallet_address)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-200/85 underline underline-offset-2"
                      >
                        {w.wallet_address.slice(0, 6)}…{w.wallet_address.slice(-4)}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-10 border border-emerald-900/35 bg-emerald-950/10 p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-400/85">Settlement proof</h2>
              <p className="mt-2 text-[11px] text-zinc-500">
                On-chain receipts for treasury coordination — explorer links validate native SOL transfers.
              </p>
              <ul className="mt-4 space-y-3">
                {(data.rewards?.settlements || data.rewards?.recent_payouts || []).map((row) => (
                  <li
                    key={row.id}
                    className="border border-zinc-800/90 bg-black/35 p-3 text-xs leading-relaxed text-zinc-300"
                  >
                    <div className="flex flex-wrap gap-2 font-mono text-[11px] text-zinc-400">
                      <span className={row.status === "completed" ? "text-emerald-300" : ""}>{row.status}</span>
                      <span>amount {Number(row.amount).toFixed(8)}</span>
                    </div>
                    {row.tx_hash ? (
                      <a
                        href={row.explorer_url || txExplorerUrl(row.tx_hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-emerald-200/85 underline underline-offset-2"
                      >
                        {proofLabel()} {shortTxHash(row.tx_hash)} ↗
                      </a>
                    ) : (
                      <span className="mt-2 block text-zinc-600">Awaiting settlement tx…</span>
                    )}
                    {row.payout_reason && (
                      <p className="mt-2 text-[10px] text-zinc-600">
                        Reason:{" "}
                        <span className="font-mono text-zinc-500">{String(row.payout_reason).slice(0, 240)}</span>
                      </p>
                    )}
                    {row.settlement_kind && (
                      <p className="mt-1 text-[10px] text-zinc-600">Kind: {row.settlement_kind}</p>
                    )}
                  </li>
                ))}
              </ul>
              {(data.rewards?.settlements || []).length === 0 && (
                <p className="mt-4 text-xs text-zinc-600">No settlement rows yet.</p>
              )}
            </section>

            <section className="mt-10 border border-zinc-800 bg-[#0a0a0a]/90 p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Recent post economics</h2>
              <p className="mt-1 text-[11px] text-zinc-600">
                Accruals from posts (anchored and x402-flagged proofs earn higher tiers). Commerce uses x402; settlement
                is separate treasury SOL.
              </p>
              <ul className="mt-4 max-h-64 space-y-2 overflow-auto text-xs font-mono text-zinc-400">
                {(data.rewards?.recent_post_scores || []).map((r) => (
                  <li key={r.post_id}>
                    post {String(r.post_id).slice(-8)} … score {Number(r.score).toFixed(2)} · units{" "}
                    {Number(r.final_reward).toFixed(8)} · {String(r.reason || "").slice(0, 72)}
                  </li>
                ))}
              </ul>
              {(data.rewards?.recent_post_scores || []).length === 0 && (
                <p className="mt-3 text-xs text-zinc-600">No scoring rows.</p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function RewardsDashboardPage() {
  return (
    <AppAuthProvider>
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-400">
            Loading…
          </div>
        }
      >
        <RewardsInner />
      </Suspense>
    </AppAuthProvider>
  );
}
