"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { txExplorerUrl, shortTxHash } from "@/lib/solana";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function fmtBps(bps) {
  if (bps == null) return "—";
  const pct = Number(bps) / 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}
function fmtLamports(s) {
  if (s == null) return "—";
  const n = typeof s === "string" ? Number(s) : s;
  if (!Number.isFinite(n)) return "—";
  return `${(n / 1e9).toFixed(4)} SOL`;
}
function fmtTs(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const delta = Math.max(0, Date.now() - d.getTime());
  const s = Math.round(delta / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export default function IntentsPanel({ contractId, initialIntents }) {
  const { isSignedIn, getAuthHeaders, activeAgent } = useAuth();
  const [intents, setIntents] = useState(initialIntents || []);
  const [side, setSide] = useState("buy");
  const [sol, setSol] = useState("0.05");
  const [slippage, setSlippage] = useState("50");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [simResult, setSimResult] = useState(null);

  // Poll intents every 15s so paper PnL refreshes without a hard reload.
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/contracts/${contractId}/intents?limit=50`, { cache: "no-store" });
        if (res.ok) setIntents(await res.json());
      } catch {}
    }, 15000);
    return () => clearInterval(t);
  }, [contractId]);

  const amountLamports = useMemo(() => {
    const n = Number(sol);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 1e9).toString();
  }, [sol]);

  async function stakeIntent() {
    if (!amountLamports) {
      setErr("Enter a positive SOL amount");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/contracts/${contractId}/intents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          side,
          amount_lamports: amountLamports,
          slippage_bps: Number(slippage) || 50,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to stake intent");
      setIntents((prev) => [{ ...data, agent_name: activeAgent?.name }, ...prev]);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function simulate(intentId) {
    setSimResult({ intentId, loading: true });
    try {
      const res = await fetch(`${API_URL}/intents/${intentId}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      const data = await res.json();
      setSimResult({ intentId, loading: false, data, error: res.ok ? null : data.error });
    } catch (e) {
      setSimResult({ intentId, loading: false, error: e.message });
    }
  }

  async function execute(intentId) {
    if (!confirm("Execute this swap on-chain? This will spend SOL from your agent's Privy wallet.")) return;
    setBusy(true);
    setErr(null);
    try {
      const idem = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
      const res = await fetch(`${API_URL}/intents/${intentId}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idem,
          ...getAuthHeaders(),
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Execute failed");
      // Refresh intents
      const fresh = await fetch(`${API_URL}/contracts/${contractId}/intents?limit=50`, { cache: "no-store" });
      if (fresh.ok) setIntents(await fresh.json());
      alert(`Submitted: ${data.tx_hash || data.wallet_tx_id}`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-zinc-900 bg-[#0a0a0a]/90">
      <div className="border-b border-zinc-900 px-4 py-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">Stake an intent</h2>
        <p className="mt-1 text-[10px] text-zinc-500">Anchored to a Jupiter v6 quote. Paper PnL tracks it vs live price.</p>
      </div>

      <div className="space-y-3 px-4 py-4">
        <div className="flex gap-2">
          {["buy", "sell"].map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              type="button"
              className={`flex-1 border px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] ${
                side === s
                  ? s === "buy"
                    ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300"
                    : "border-[#E53935]/60 bg-[#E53935]/15 text-[#ffb5b3]"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <label className="block text-[10px] uppercase tracking-[0.12em] text-zinc-500">
          Amount (SOL)
          <input
            value={sol}
            onChange={(e) => setSol(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full border border-zinc-800 bg-[#050505] px-3 py-2 text-sm text-zinc-100 focus:border-[#E53935] focus:outline-none"
          />
        </label>
        <label className="block text-[10px] uppercase tracking-[0.12em] text-zinc-500">
          Slippage (bps)
          <input
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
            inputMode="numeric"
            className="mt-1 w-full border border-zinc-800 bg-[#050505] px-3 py-2 text-sm text-zinc-100 focus:border-[#E53935] focus:outline-none"
          />
        </label>

        {!isSignedIn ? (
          <div className="border border-zinc-800 bg-[#050505] px-3 py-2 text-[11px] text-zinc-500">
            Sign in to stake an intent.
          </div>
        ) : (
          <button
            disabled={busy}
            onClick={stakeIntent}
            className="w-full border border-[#E53935] bg-[#E53935] px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white hover:bg-[#b71c1c] disabled:opacity-50"
          >
            {busy ? "Working…" : `Stake ${side.toUpperCase()} intent`}
          </button>
        )}
        {err && <div className="text-xs text-[#ff9e9c]">{err}</div>}
        <div className="text-[10px] text-zinc-600">
          Platform fee: shown in simulation. Execution applies the fee only if ops has configured the fee wallet and ATA.
        </div>
      </div>

      <div className="border-t border-zinc-900 px-4 py-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">
          Intents ({intents.length})
        </h3>
      </div>
      <ul className="divide-y divide-zinc-900">
        {intents.length === 0 && (
          <li className="px-4 py-6 text-center text-xs text-zinc-500">
            No intents yet. Stake one to kick off the PvP loop.
          </li>
        )}
        {intents.map((i) => {
          const label = i.pvp_label || "first";
          const pnl = i.paper_pnl_bps ?? null;
          return (
            <li key={i.id} className="px-4 py-3 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {i.agent_name ? (
                    <Link href={`/agent/${encodeURIComponent(i.agent_name)}`} className="font-medium text-zinc-200 hover:text-white">
                      {i.agent_name}
                    </Link>
                  ) : (
                    <span className="font-medium text-zinc-400">{i.created_by_agent_id}</span>
                  )}
                  <span
                    className={`border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${
                      i.side === "buy"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-[#E53935]/30 bg-[#E53935]/10 text-[#ffb5b3]"
                    }`}
                  >
                    {i.side}
                  </span>
                  <span className="border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-400">
                    {label}
                  </span>
                </div>
                <span className="text-zinc-600">{fmtTs(i.created_at)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-zinc-500">
                <span>{fmtLamports(i.amount_lamports)}</span>
                <span
                  className={
                    pnl == null
                      ? "text-zinc-600"
                      : pnl > 0
                      ? "text-emerald-400"
                      : pnl < 0
                      ? "text-[#ff9e9c]"
                      : "text-zinc-400"
                  }
                >
                  paper {fmtBps(pnl)}
                  {i.realized_pnl_bps != null && <span className="ml-2 text-zinc-300">· realized {fmtBps(i.realized_pnl_bps)}</span>}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-600">
                <span>{i.status}{i.score_status ? ` · ${i.score_status}` : ""}</span>
                <div className="flex items-center gap-2">
                  {i.tx_hash && (
                    <a
                      href={txExplorerUrl(i.tx_hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-zinc-500 hover:text-[#ffb5b3]"
                      title={i.tx_hash}
                    >
                      {shortTxHash(i.tx_hash)} ↗
                    </a>
                  )}
                  {isSignedIn && (
                    <>
                      <button onClick={() => simulate(i.id)} className="border border-zinc-800 px-2 py-0.5 uppercase tracking-[0.12em] hover:border-zinc-700 hover:text-zinc-300">simulate</button>
                      <button onClick={() => execute(i.id)} className="border border-[#E53935]/50 px-2 py-0.5 uppercase tracking-[0.12em] text-[#ffb5b3] hover:bg-[#E53935] hover:text-white">execute</button>
                    </>
                  )}
                </div>
              </div>
              {simResult?.intentId === i.id && (
                <div className="mt-2 border border-zinc-800 bg-[#050505] p-2 text-[10px] text-zinc-400">
                  {simResult.loading && <div>simulating…</div>}
                  {simResult.error && <div className="text-[#ff9e9c]">{simResult.error}</div>}
                  {simResult.data && (
                    <div className="space-y-1">
                      <div>out: {simResult.data.quote?.out_amount} · impact {simResult.data.quote?.price_impact_pct}</div>
                      <div>platform fee: {simResult.data.quote?.platform_fee_bps ?? 0} bps{simResult.data.quote?.platform_fee_reason ? ` (${simResult.data.quote.platform_fee_reason})` : ""}</div>
                      <div>
                        simulation: {simResult.data.simulation?.ok ? "✓" : "✗"}
                        {simResult.data.simulation?.error && <span className="ml-2 text-[#ff9e9c]">{JSON.stringify(simResult.data.simulation.error)}</span>}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
