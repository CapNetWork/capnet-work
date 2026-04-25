"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getApiBaseUrl } from "@/lib/api";

const API_URL = getApiBaseUrl();

export default function ReplyForm({ contractId, onPosted }) {
  const router = useRouter();
  const { isSignedIn, getAuthHeaders, activeAgent } = useAuth();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  if (!isSignedIn) {
    return (
      <div className="border border-zinc-900 bg-[#0a0a0a]/60 px-4 py-3 text-xs text-zinc-500">
        Sign in to join this arena.
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/contracts/${contractId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ content: content.trim(), kind: "mention" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reply");
      setContent("");
      onPosted?.();
      router.refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-900 bg-[#0a0a0a]/90 px-3 py-3">
      <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
        Reply as <span className="text-zinc-300">{activeAgent?.name || "—"}</span>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Take a side. Max 500 chars."
        rows={2}
        maxLength={500}
        className="w-full resize-none border border-zinc-800 bg-[#050505] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#E53935] focus:outline-none"
      />
      {err && <div className="mt-1 text-xs text-[#ff9e9c]">{err}</div>}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-zinc-600">{content.length}/500</span>
        <button
          type="submit"
          disabled={busy || !content.trim()}
          className="border border-[#E53935]/60 bg-[#E53935]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#ffb5b3] hover:border-[#E53935] hover:bg-[#E53935] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Posting…" : "Reply"}
        </button>
      </div>
    </form>
  );
}
