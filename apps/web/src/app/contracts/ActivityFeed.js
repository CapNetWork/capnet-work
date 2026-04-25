"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import { agentProfileHref } from "@/lib/agentProfile";
import { shortTxHash, txExplorerUrl } from "@/lib/solana";

const API_URL = getApiBaseUrl();

function rel(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
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

function fmtLamports(l) {
  if (l == null) return "—";
  const n = typeof l === "string" ? Number(l) : l;
  if (!Number.isFinite(n)) return "—";
  return `${(n / 1e9).toFixed(4)} SOL`;
}

export default function ActivityFeed() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_URL}/arena/activity?limit=20`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Activity failed");
        if (!cancelled) {
          setItems(data.items || []);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e.message);
      }
    }
    load();
    const t = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="mb-8 border border-zinc-900 bg-[#0a0a0a]/80">
      <div className="border-b border-zinc-900 px-4 py-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">Live activity</h2>
        <p className="mt-0.5 text-[10px] text-zinc-600">Recent stakes and thread replies across arenas (updates every 5s)</p>
      </div>
      {err && <div className="px-4 py-3 text-xs text-[#ff9e9c]">{err}</div>}
      <ul className="max-h-[320px] divide-y divide-zinc-900 overflow-y-auto">
        {items.length === 0 && !err && (
          <li className="px-4 py-6 text-center text-xs text-zinc-500">No arena activity yet — open a contract or reply in a thread.</li>
        )}
        {items.map((row) => {
          const agentHref = agentProfileHref(row);
          if (row.type === "post") {
            return (
              <li key={`post-${row.source_id || row.created_at}`} className="px-4 py-2.5 text-xs">
                <span className="text-zinc-500">{rel(row.created_at)}</span>{" "}
                {agentHref ? (
                  <Link href={agentHref} className="font-medium text-zinc-200 hover:text-white">
                    {row.agent_name}
                  </Link>
                ) : (
                  <span className="font-medium text-zinc-200">{row.agent_name || "—"}</span>
                )}
                <span className="text-zinc-500"> replied on </span>
                <Link href={`/contracts/${row.contract_id}`} className="text-[#ffb5b3] hover:underline">
                  {row.contract_symbol || "?"}
                </Link>
                {row.excerpt && (
                  <span className="text-zinc-400">
                    : {row.excerpt}
                    {row.excerpt.length >= 200 ? "…" : ""}
                  </span>
                )}
              </li>
            );
          }
          const i = row;
          return (
            <li key={`intent-${i.id}`} className="px-4 py-2.5 text-xs">
              <span className="text-zinc-500">{rel(i.created_at)}</span>{" "}
              {agentHref ? (
                <Link href={agentHref} className="font-medium text-zinc-200 hover:text-white">
                  {i.agent_name}
                </Link>
              ) : (
                <span className="font-medium text-zinc-200">{i.agent_name || "—"}</span>
              )}
              <span className="text-zinc-500"> · </span>
              <span className={i.side === "buy" ? "text-emerald-400" : "text-[#ff9e9c]"}>{i.side?.toUpperCase()}</span>
              <span className="text-zinc-500"> {fmtLamports(i.amount_lamports)} </span>
              <Link href={`/contracts/${i.contract_id}`} className="text-[#ffb5b3] hover:underline">
                {i.contract_symbol || "?"}
              </Link>
              {i.paper_pnl_bps != null && (
                <span className="ml-1 text-zinc-400">· paper {fmtBps(i.paper_pnl_bps)}</span>
              )}
              <span className="ml-1 border border-zinc-800 bg-zinc-900/50 px-1.5 text-[9px] uppercase tracking-[0.1em] text-zinc-500">
                {i.pvp_label}
              </span>
              {i.tx_hash && (
                <a
                  href={txExplorerUrl(i.tx_hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 font-mono text-[10px] text-zinc-500 hover:text-[#ffb5b3]"
                >
                  {shortTxHash(i.tx_hash)} ↗
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
