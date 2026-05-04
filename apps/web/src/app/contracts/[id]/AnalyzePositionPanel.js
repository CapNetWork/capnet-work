"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getApiBaseUrl } from "@/lib/api";
import { txExplorerUrl, shortTxHash } from "@/lib/solana";

const API_URL = getApiBaseUrl();
const SOLANA_CLUSTER = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "mainnet-beta").toLowerCase();
const IS_DEVNET = SOLANA_CLUSTER === "devnet";

export default function AnalyzePositionPanel({ contractId, onComplete }) {
  const { isSignedIn, getAuthHeaders, loading: authLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [anchor, setAnchor] = useState(IS_DEVNET);
  const [result, setResult] = useState(null);

  async function run() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(
        `${API_URL}/agent-runtime/markets/${encodeURIComponent(contractId)}/analyze-and-position`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ anchor }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      setResult(data);
      onComplete?.();
    } catch (e) {
      setErr(e.message || "Request failed");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) return null;

  if (!isSignedIn) {
    return (
      <div className="mb-4 border border-zinc-800 bg-[#0a0a0a]/90 px-4 py-3 text-xs text-zinc-500">
        Sign in to run agent analysis on this market.
      </div>
    );
  }

  const txUrl = result?.position?.memo_tx_hash ? txExplorerUrl(result.position.memo_tx_hash) : null;

  return (
    <div className="mb-6 border border-zinc-900 bg-[#0a0a0a]/90">
      <div className="border-b border-zinc-900 px-4 py-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">Agent analysis</h2>
        <p className="mt-1 text-[10px] text-zinc-500">
          Runs a stub decision, posts a thesis, and optionally anchors a prediction intent hash on Solana (devnet).
        </p>
      </div>
      <div className="space-y-3 px-4 py-4">
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
          <input
            type="checkbox"
            checked={anchor}
            onChange={(e) => setAnchor(e.target.checked)}
            className="rounded border-zinc-700 bg-zinc-900"
          />
          Anchor on Solana (memo tx, devnet only)
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="w-full border border-[#E53935] bg-[#E53935] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white hover:bg-[#c62828] disabled:opacity-50"
        >
          {busy ? "Running…" : "Run agent analysis"}
        </button>
        {err && <p className="text-xs text-red-400">{err}</p>}
        {result?.post && (
          <div className="border border-zinc-800 bg-black/40 px-3 py-2 text-xs text-zinc-300">
            <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Thesis post</div>
            <p className="mt-1 whitespace-pre-wrap text-zinc-200">{result.post.content}</p>
          </div>
        )}
        {result?.position && (
          <div className="border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
            <div className="text-[10px] uppercase tracking-[0.12em] text-emerald-600/90">Signed position</div>
            <dl className="mt-2 grid gap-1 text-zinc-300">
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Side</dt>
                <dd className="font-mono font-semibold text-emerald-300">{result.position.side}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Confidence</dt>
                <dd>{result.position.confidence}%</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Signer</dt>
                <dd className="truncate font-mono text-[10px]" title={result.position.signer_pubkey}>
                  {result.position.signer_pubkey}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Chain</dt>
                <dd className="font-mono text-[10px]">{result.position.anchor_chain}</dd>
              </div>
              {result.position.memo_tx_hash && txUrl && (
                <div className="mt-1 flex justify-between gap-2 border-t border-zinc-800 pt-2">
                  <dt className="text-zinc-500">Tx</dt>
                  <dd>
                    <Link href={txUrl} target="_blank" rel="noreferrer" className="font-mono text-[10px] text-emerald-400 hover:underline">
                      {shortTxHash(result.position.memo_tx_hash)} ↗
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
