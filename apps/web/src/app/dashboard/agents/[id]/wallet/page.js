"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { addressExplorerUrl, txExplorerUrl, shortTxHash } from "@/lib/solana";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";
const PAGE_SIZE = 25;

function formatSol(lamports) {
  if (lamports == null) return null;
  const n = Number(lamports);
  if (!Number.isFinite(n)) return null;
  return `${(n / 1_000_000_000).toFixed(4)} SOL`;
}

function StatusPill({ status }) {
  const map = {
    submitted: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    confirmed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    pending: "border-zinc-600 bg-zinc-800/40 text-zinc-300",
    failed: "border-[#E53935]/40 bg-[#E53935]/10 text-[#ff9e9c]",
    blocked: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  };
  const cls = map[status] || "border-zinc-700 bg-zinc-900 text-zinc-400";
  return (
    <span className={`border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] ${cls}`}>
      {status || "—"}
    </span>
  );
}

export default function AgentWalletPage() {
  const { id } = useParams();
  const router = useRouter();
  const { getAuthHeaders } = useAuth();
  const [agent, setAgent] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [paused, setPaused] = useState(false);
  const [pausedReason, setPausedReason] = useState(null);
  const [dailySpend, setDailySpend] = useState(null);
  const [walletAddress, setWalletAddress] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState("");

  const authHeaders = useCallback(() => ({ ...getAuthHeaders(), "X-Agent-Id": id }), [getAuthHeaders, id]);

  const fetchAll = useCallback(
    async (pageOverride) => {
      setLoading(true);
      setError(null);
      const headers = { "Content-Type": "application/json", ...authHeaders() };
      try {
        const [agentRes, policyRes, txRes] = await Promise.all([
          fetch(`${API_URL}/auth/me/agents/${id}`, { headers, cache: "no-store" }),
          fetch(`${API_URL}/integrations/privy_wallet/policy`, { headers, cache: "no-store" }),
          fetch(
            `${API_URL}/integrations/privy_wallet/transactions?limit=${PAGE_SIZE + 1}&offset=${(pageOverride ?? page) * PAGE_SIZE}`,
            { headers, cache: "no-store" }
          ),
        ]);

        const agentData = await agentRes.json().catch(() => ({}));
        if (!agentRes.ok) throw new Error(agentData.error || agentRes.statusText);
        setAgent(agentData.agent);

        const policyData = await policyRes.json().catch(() => ({}));
        if (policyRes.ok) {
          setPolicy(policyData.policy || null);
          setPaused(Boolean(policyData.is_paused));
          setPausedReason(policyData.paused_reason || null);
          setDailySpend(policyData.daily_spend_lamports ?? null);
          setWalletAddress(policyData.wallet_address || null);
        }

        const txData = await txRes.json().catch(() => ({}));
        if (!txRes.ok) throw new Error(txData.error || txRes.statusText);
        const list = Array.isArray(txData.transactions) ? txData.transactions : [];
        setHasMore(list.length > PAGE_SIZE);
        setTransactions(list.slice(0, PAGE_SIZE));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [id, authHeaders, page]
  );

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  async function callPause(method, body) {
    const path = method === "resume" ? "/integrations/privy_wallet/resume" : "/integrations/privy_wallet/pause";
    setBusy(path);
    setError(null);
    try {
      const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      await fetchAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  function changePage(next) {
    setPage(next);
    setTransactions([]);
    setHasMore(false);
    setLoading(true);
    void fetchAll(next);
  }

  if (loading && !agent) {
    return <div className="py-20 text-center text-sm text-zinc-500">Loading wallet activity...</div>;
  }

  if (!agent) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-[#ff9e9c]">{error || "Agent not found"}</p>
        <Link href="/dashboard/agents" className="mt-4 inline-block text-xs text-zinc-400 underline">
          Back to agents
        </Link>
      </div>
    );
  }

  const dailyCap = policy?.max_lamports_per_day != null ? Number(policy.max_lamports_per_day) : null;
  const perTxCap = policy?.max_lamports_per_tx != null ? Number(policy.max_lamports_per_tx) : null;

  return (
    <>
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Link href="/dashboard/agents" className="hover:text-zinc-300">
          Agents
        </Link>
        <span>/</span>
        <Link href={`/dashboard/agents/${agent.id}`} className="hover:text-zinc-300">
          {agent.name}
        </Link>
        <span>/</span>
        <span className="text-zinc-300">Wallet activity</span>
      </div>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">Wallet activity for {agent.name}</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Every signing attempt for this agent&apos;s Privy wallet, including blocked, failed, and successful transactions.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="border border-zinc-800 bg-[#0a0a0a]/85 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Wallet</p>
          {walletAddress ? (
            <a
              href={addressExplorerUrl(walletAddress) || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block break-all font-mono text-xs text-[#ffb5b3] hover:underline"
            >
              {walletAddress}
            </a>
          ) : (
            <p className="mt-1 text-xs text-zinc-500">No Privy wallet linked.</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {paused ? (
              <span className="border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-amber-300">
                Paused
              </span>
            ) : (
              <span className="border border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300">
                Active
              </span>
            )}
            {paused && pausedReason && <span className="text-[10px] text-amber-300">{pausedReason}</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {paused ? (
              <button
                type="button"
                onClick={() => callPause("resume")}
                disabled={Boolean(busy)}
                className="border border-emerald-500/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
              >
                {busy.endsWith("/resume") ? "Resuming..." : "Resume"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const reason = window.prompt("Pause reason (optional)") || "";
                  callPause("pause", { reason });
                }}
                disabled={Boolean(busy) || !walletAddress}
                className="border border-amber-500/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
              >
                {busy.endsWith("/pause") ? "Pausing..." : "Pause"}
              </button>
            )}
            <Link
              href={`/dashboard/agents/${id}/integrations`}
              className="border border-zinc-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-300 hover:border-zinc-500 hover:text-white"
            >
              Integrations
            </Link>
          </div>
        </div>

        <div className="border border-zinc-800 bg-[#0a0a0a]/85 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Policy</p>
          <dl className="mt-2 space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">per-tx cap</dt>
              <dd className="font-mono text-zinc-300">{formatSol(perTxCap) || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">24h cap</dt>
              <dd className="font-mono text-zinc-300">{formatSol(dailyCap) || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">24h spent</dt>
              <dd className="font-mono text-zinc-300">{formatSol(dailySpend) || "0.0000 SOL"}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-zinc-500">allowed programs</dt>
              <dd className="break-all font-mono text-[10px] text-zinc-400">
                {policy?.allowed_program_ids?.length
                  ? policy.allowed_program_ids.slice(0, 8).join(", ") +
                    (policy.allowed_program_ids.length > 8 ? ", ..." : "")
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {error && <p className="mt-4 text-xs text-[#ff9e9c]">{error}</p>}

      <div className="mt-6 border border-zinc-800 bg-[#0a0a0a]/85">
        <div className="flex items-center justify-between border-b border-zinc-800/50 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">All transactions</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changePage(Math.max(0, page - 1))}
              disabled={page === 0 || loading}
              className="border border-zinc-700 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400 disabled:opacity-50 hover:border-zinc-500 hover:text-white"
            >
              Prev
            </button>
            <span className="text-[10px] text-zinc-500">page {page + 1}</span>
            <button
              type="button"
              onClick={() => changePage(page + 1)}
              disabled={!hasMore || loading}
              className="border border-zinc-700 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400 disabled:opacity-50 hover:border-zinc-500 hover:text-white"
            >
              Next
            </button>
          </div>
        </div>

        {loading ? (
          <p className="px-4 py-12 text-center text-xs text-zinc-500">Loading transactions...</p>
        ) : transactions.length === 0 ? (
          <p className="px-4 py-12 text-center text-xs text-zinc-500">No transactions yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800/50 text-left text-[9px] uppercase tracking-[0.14em] text-zinc-500">
                <th className="px-4 py-2 font-bold">When</th>
                <th className="px-4 py-2 font-bold">Type</th>
                <th className="px-4 py-2 font-bold">Status</th>
                <th className="px-4 py-2 font-bold">Amount</th>
                <th className="px-4 py-2 font-bold">Program / dest</th>
                <th className="px-4 py-2 font-bold">Hash</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-zinc-800/30 last:border-0 hover:bg-zinc-900/40">
                  <td className="px-4 py-2 text-zinc-400">
                    {tx.created_at ? new Date(tx.created_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-zinc-300">{tx.tx_type}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={tx.status} />
                    {tx.status === "blocked" && tx.error_message && (
                      <span className="ml-2 text-[10px] text-amber-300">{tx.error_message}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-zinc-400">{formatSol(tx.amount_lamports) || "—"}</td>
                  <td className="px-4 py-2 break-all font-mono text-[10px] text-zinc-500">
                    {tx.program_id || tx.destination || "—"}
                  </td>
                  <td className="px-4 py-2">
                    {tx.tx_hash ? (
                      <a
                        href={txExplorerUrl(tx.tx_hash) || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[#ffb5b3] hover:underline"
                      >
                        {shortTxHash(tx.tx_hash)}
                      </a>
                    ) : (
                      <span className="font-mono text-zinc-700">{tx.id}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => router.refresh()}
          className="text-xs text-zinc-500 underline hover:text-zinc-300"
        >
          Refresh
        </button>
      </div>
    </>
  );
}
