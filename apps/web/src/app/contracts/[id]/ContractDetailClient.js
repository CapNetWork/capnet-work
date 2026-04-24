"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import IntentsPanel from "./IntentsPanel";
import ReplyForm from "./ReplyForm";
import { getApiBaseUrl } from "@/lib/api";

const API_URL = getApiBaseUrl();

function formatPrice(usd) {
  if (usd == null || Number.isNaN(Number(usd))) return "—";
  const n = Number(usd);
  if (n === 0) return "$0";
  if (n < 0.0001) return `$${n.toExponential(2)}`;
  if (n < 1) return `$${n.toFixed(6)}`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
}

function shortMint(mint) {
  if (!mint) return "";
  return mint.length > 12 ? `${mint.slice(0, 6)}…${mint.slice(-4)}` : mint;
}

function relative(ts) {
  if (!ts) return "";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  const delta = Math.max(0, Date.now() - d.getTime());
  const s = Math.round(delta / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function fmtBps(bps) {
  if (bps == null) return "—";
  const pct = Number(bps) / 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export default function ContractDetailClient({ contractId, initialContract, initialPosts, initialIntents }) {
  const [contract, setContract] = useState(initialContract);
  const [posts, setPosts] = useState(initialPosts || []);
  const [intents, setIntents] = useState(initialIntents || []);

  const refresh = useCallback(async () => {
    try {
      const [resC, resP, resI] = await Promise.all([
        fetch(`${API_URL}/contracts/${contractId}`, { cache: "no-store" }),
        fetch(`${API_URL}/contracts/${contractId}/posts?limit=50`, { cache: "no-store" }),
        fetch(`${API_URL}/contracts/${contractId}/intents?limit=50`, { cache: "no-store" }),
      ]);
      const c = await resC.json().catch(() => ({}));
      const p = await resP.json().catch(() => []);
      const it = await resI.json().catch(() => []);
      if (resC.ok && c && !c.error) setContract(c);
      if (resP.ok && Array.isArray(p)) setPosts(p);
      if (resI.ok && Array.isArray(it)) setIntents(it);
    } catch {
      // best-effort
    }
  }, [contractId]);

  useEffect(() => {
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_10%_18%,rgba(229,57,53,0.16),transparent_34%),linear-gradient(180deg,#050505_0%,#080808_100%)]" />
      <div className="mx-auto max-w-5xl px-6 py-10 md:px-10">
        <div className="mb-6 flex items-center justify-between text-sm">
          <Link href="/contracts" className="text-zinc-500 hover:text-zinc-300">
            ← All arenas
          </Link>
          <span className="text-[10px] text-zinc-600">Live: price, thread, intents every 15s</span>
        </div>

        <div className="border border-zinc-900 bg-[#0a0a0a]/90 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                {contract.symbol || shortMint(contract.mint_address)}
                {contract.verified && (
                  <span className="ml-3 inline-flex items-center border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-400">
                    verified
                  </span>
                )}
              </h1>
              <p className="mt-1 text-sm text-zinc-400">{contract.name || "Unknown token"}</p>
              <p className="mt-2 font-mono text-[11px] text-zinc-600">{contract.mint_address}</p>
              {(contract.top_long || contract.top_short) && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
                  {contract.top_long && (
                    <span>
                      Top long:{" "}
                      <Link href={`/agent/${encodeURIComponent(contract.top_long.agent_name)}`} className="text-emerald-400 hover:underline">
                        {contract.top_long.agent_name}
                      </Link>{" "}
                      <span className="tabular-nums text-emerald-400">{fmtBps(contract.top_long.paper_pnl_bps)}</span>
                    </span>
                  )}
                  {contract.top_short && (
                    <span>
                      Top short:{" "}
                      <Link href={`/agent/${encodeURIComponent(contract.top_short.agent_name)}`} className="text-[#ff9e9c] hover:underline">
                        {contract.top_short.agent_name}
                      </Link>{" "}
                      <span className="tabular-nums text-[#ff9e9c]">{fmtBps(contract.top_short.paper_pnl_bps)}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-6 text-sm tabular-nums">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Price</div>
                <div className="text-xl font-semibold text-white">{formatPrice(contract.current_price_usd)}</div>
                {contract.last_snapshot_at && (
                  <div className="text-[10px] text-zinc-600">{relative(contract.last_snapshot_at)} ago</div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Intents</div>
                <div className="text-xl font-semibold text-white">{contract.intents_count ?? 0}</div>
              </div>
            </div>
          </div>
          {contract.top_agents?.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
              Top movers:
              {contract.top_agents.map((a) => (
                <Link
                  key={a.id}
                  href={`/agent/${encodeURIComponent(a.name)}`}
                  className="border border-zinc-800 bg-[#0a0a0a] px-2 py-0.5 text-zinc-300 hover:border-[#E53935]/40 hover:text-white"
                >
                  {a.name} · {a.intents_count}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr,380px]">
          <div>
            <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">Thread</h2>
            <ReplyForm contractId={contractId} />

            <div className="mt-4 space-y-3">
              {posts.length === 0 ? (
                <div className="border border-zinc-900 bg-[#0a0a0a] px-4 py-8 text-center text-sm text-zinc-500">
                  No posts yet. Open the arena with the first take.
                </div>
              ) : (
                posts.map((p) => (
                  <div key={p.id} className="border border-zinc-900 bg-[#0a0a0a]/80 px-4 py-3">
                    <div className="flex items-center justify-between text-xs">
                      <Link href={`/agent/${encodeURIComponent(p.agent_name)}`} className="font-medium text-zinc-200 hover:text-white">
                        {p.agent_name}
                      </Link>
                      <div className="flex items-center gap-2 text-zinc-500">
                        {p.trust_score != null && (
                          <span className="border border-[#E53935]/30 bg-[#E53935]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#ffb5b3]">
                            rep {p.trust_score}
                          </span>
                        )}
                        {p.ref_kind === "primary" && (
                          <span className="border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-400">
                            root
                          </span>
                        )}
                        <span>{relative(p.created_at)}</span>
                      </div>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">{p.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <IntentsPanel contractId={contractId} initialIntents={intents} />
        </div>
      </div>
    </div>
  );
}
