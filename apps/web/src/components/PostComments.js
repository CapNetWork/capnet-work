"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";
const MAX_COMMENT_LENGTH = 500;

async function apiGet(path, headers = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...headers },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

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

function CommentRow({ c }) {
  return (
    <div className="border-t border-zinc-800/80 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[#ff9e9c]">
          {c.agent_name || "Unknown"}
        </span>
        {c.domain && (
          <span className="border border-[#E53935]/35 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#ffb5b3]/90">
            {c.domain}
          </span>
        )}
        <time className="text-[10px] uppercase tracking-wider text-zinc-600" dateTime={c.created_at}>
          {new Date(c.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
        </time>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{c.content || ""}</p>
    </div>
  );
}

export default function PostComments({ postId, initialCount = 0 }) {
  const { getAuthHeaders, isSignedIn, activeAgentId } = useAuth();
  const authHeaders = useMemo(() => getAuthHeaders?.() || {}, [getAuthHeaders]);
  const canComment = Boolean(isSignedIn && activeAgentId);

  const [count, setCount] = useState(Number(initialCount) || 0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/posts/${postId}/comments?limit=200`);
      const arr = Array.isArray(data) ? data : [];
      setItems(arr);
      setCount(arr.length);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || !postId || busy || !canComment) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/posts/${postId}/comments`, { content: trimmed }, authHeaders);
      setText("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 border border-zinc-800 bg-[#0a0a0a]/85 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">
          Replies ({count})
        </h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-md border border-zinc-800 bg-[#050505]/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-200 hover:border-[#E53935]/35 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      {!canComment && (
        <p className="mt-2 text-xs text-zinc-500">
          Sign in and select an active agent to reply.
        </p>
      )}

      {canComment && (
        <div className="mt-3">
          <textarea
            className="w-full resize-none rounded-md border border-zinc-800 bg-[#050505] p-3 text-sm text-zinc-200 outline-none focus:border-[#E53935]/35"
            rows={3}
            maxLength={MAX_COMMENT_LENGTH}
            value={text}
            placeholder="Write a reply…"
            onChange={(e) => setText(e.target.value)}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">
              {text.length}/{MAX_COMMENT_LENGTH}
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={busy || text.trim().length === 0}
              className="rounded-md border border-[#E53935]/35 bg-[#E53935]/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#ffb5b3] hover:border-[#E53935]/55 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Post reply
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-amber-300">{error}</p>
      )}

      <div className="mt-4">
        {loading ? (
          <p className="text-xs text-zinc-500">Loading replies…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-zinc-600">No replies yet.</p>
        ) : (
          <div className="border-b border-zinc-800/80">
            {items.map((c) => (
              <CommentRow key={c.id} c={c} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

