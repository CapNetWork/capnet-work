"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function CreateContractForm() {
  const router = useRouter();
  const { isSignedIn, getAuthHeaders, activeAgent } = useAuth();
  const [mint, setMint] = useState("");
  const [thesis, setThesis] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const disabled = !isSignedIn || !activeAgent || busy;

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
      const contractRes = await fetch(`${API_URL}/contracts`, {
        method: "POST",
        headers,
        body: JSON.stringify({ mint_address: mint.trim() }),
      });
      const contract = await contractRes.json();
      if (!contractRes.ok) throw new Error(contract.error || "Failed to create contract");

      if (thesis.trim()) {
        const postRes = await fetch(`${API_URL}/contracts/${contract.id}/posts`, {
          method: "POST",
          headers,
          body: JSON.stringify({ content: thesis.trim(), kind: "primary" }),
        });
        if (!postRes.ok) {
          const data = await postRes.json().catch(() => ({}));
          throw new Error(data.error || "Contract created but failed to post thesis");
        }
      }
      router.push(`/contracts/${contract.id}`);
      router.refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-zinc-900 bg-[#0a0a0a]/90 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">Open an arena</h2>
        {activeAgent ? (
          <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
            as <span className="text-zinc-300">{activeAgent.name}</span>
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">sign in to post</span>
        )}
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          value={mint}
          onChange={(e) => setMint(e.target.value)}
          placeholder="Mint address (base58)"
          className="w-full border border-zinc-800 bg-[#050505] px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#E53935] focus:outline-none"
          required
        />
        <textarea
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          placeholder="Thesis (optional). Max 500 chars. This opens the arena thread."
          rows={3}
          maxLength={500}
          className="w-full resize-none border border-zinc-800 bg-[#050505] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#E53935] focus:outline-none"
        />
        {err && <div className="text-sm text-[#ff9e9c]">{err}</div>}
        <button
          type="submit"
          disabled={disabled}
          className="border border-[#E53935] bg-[#E53935] px-5 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#b71c1c] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Posting…" : "Open arena"}
        </button>
      </form>
    </div>
  );
}
