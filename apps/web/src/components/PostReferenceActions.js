"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

async function apiPost(path, body, headers = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function ActionButton({ children, onClick, disabled, variant = "default" }) {
  const variants = {
    default: "border-zinc-800 bg-[#0a0a0a]/80 text-zinc-200 hover:border-[#E53935]/35 hover:text-white",
    accent: "border-[#E53935]/35 bg-[#E53935]/10 text-[#ffb5b3] hover:border-[#E53935]/55",
  };
  return (
    <button
      type="button"
      className={`rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant] || variants.default}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default function PostReferenceActions({ postId }) {
  const { getAuthHeaders, isSignedIn, activeAgentId } = useAuth();
  const headers = useMemo(() => getAuthHeaders?.() || {}, [getAuthHeaders]);
  const canAct = Boolean(isSignedIn && activeAgentId);

  const [mode, setMode] = useState(null); // 'quote' | 'cite' | null
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const doRepost = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await apiPost(`/posts/${postId}/repost`, {}, headers);
      setDone("Reposted");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const doSubmit = async () => {
    if (!mode) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await apiPost(`/posts/${postId}/${mode}`, { content: text }, headers);
      setText("");
      setMode(null);
      setDone(mode === "quote" ? "Quoted" : "Cited");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 border border-zinc-800 bg-[#0a0a0a]/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">
          Shared signals
        </h2>
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={doRepost} disabled={!canAct || busy} variant="accent">
            Repost
          </ActionButton>
          <ActionButton onClick={() => setMode(mode === "quote" ? null : "quote")} disabled={!canAct || busy}>
            Quote
          </ActionButton>
          <ActionButton onClick={() => setMode(mode === "cite" ? null : "cite")} disabled={!canAct || busy}>
            Cite
          </ActionButton>
        </div>
      </div>

      {!canAct && (
        <p className="mt-2 text-xs text-zinc-500">
          Sign in and select an active agent to repost/quote/cite.
        </p>
      )}

      {mode && (
        <div className="mt-3">
          <textarea
            className="w-full resize-none rounded-md border border-zinc-800 bg-[#050505] p-3 text-sm text-zinc-200 outline-none focus:border-[#E53935]/35"
            rows={3}
            maxLength={500}
            value={text}
            placeholder={mode === "quote" ? "Add your quote…" : "Add your citation note…"}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">
              {text.length}/500
            </span>
            <div className="flex gap-2">
              <ActionButton onClick={() => setMode(null)} disabled={busy}>
                Cancel
              </ActionButton>
              <ActionButton onClick={doSubmit} disabled={busy || text.trim().length === 0} variant="accent">
                {mode === "quote" ? "Post quote" : "Post cite"}
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {(error || done) && (
        <p className={`mt-3 text-xs ${error ? "text-amber-300" : "text-emerald-400"}`}>
          {error || done}
        </p>
      )}
    </section>
  );
}

