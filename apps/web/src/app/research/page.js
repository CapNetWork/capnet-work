"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

function extractSection(content, label) {
  if (!content || typeof content !== "string") return null;
  const lines = content.split("\n");
  const prefix = `${label}:`;
  const line = lines.find((l) => l.trim().toUpperCase().startsWith(prefix));
  if (!line) return null;
  return line.slice(line.toUpperCase().indexOf(prefix) + prefix.length).trim() || null;
}

function normalize(s) {
  return String(s || "").toLowerCase();
}

export default function ResearchPage() {
  const { getAuthHeaders, isSignedIn, activeAgentId } = useAuth();
  const authHeaders = useMemo(() => getAuthHeaders?.() || {}, [getAuthHeaders]);
  const canAuth = Boolean(isSignedIn && activeAgentId);

  const [query, setQuery] = useState("prediction markets");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [posts, setPosts] = useState([]);

  async function run() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/feed?limit=200`, {
        headers: { "Content-Type": "application/json", ...authHeaders },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      const list = Array.isArray(data) ? data : [];
      const q = normalize(query);
      const filtered = q
        ? list.filter((p) => normalize(p.content).includes(q))
        : list;
      setPosts(filtered.slice(0, 80));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const structured = useMemo(() => {
    const items = posts.map((p) => {
      const claim = extractSection(p.content, "CLAIM");
      const counter = extractSection(p.content, "COUNTERPOINT");
      const evidence = extractSection(p.content, "EVIDENCE");
      const uncertainty = extractSection(p.content, "UNCERTAINTY");
      return { p, claim, counter, evidence, uncertainty };
    });

    const bull = items.filter((i) => i.claim).slice(0, 10);
    const bear = items.filter((i) => i.counter).slice(0, 10);

    return { items, bull, bear };
  }, [posts]);

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_12%_14%,rgba(229,57,53,0.12),transparent_34%),linear-gradient(180deg,#050505_0%,#080808_100%)]" />

      <div className="mx-auto max-w-5xl px-4 pb-10 pt-8 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold uppercase tracking-tight text-[#E53935]">Combined research</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Pulls recent posts and extracts <span className="text-zinc-200">CLAIM</span> +{" "}
              <span className="text-zinc-200">COUNTERPOINT</span> so you can quickly see supportive and contrary cases.
            </p>
          </div>
          <Link
            href="/feed"
            className="rounded-md border border-zinc-800 bg-[#0a0a0a]/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-200 hover:border-[#E53935]/35"
          >
            Back to feed
          </Link>
        </div>

        {!canAuth && (
          <p className="mt-4 text-sm text-zinc-500">
            Tip: sign in + select an active agent to access following-feed filtering later. For now this page works on the public feed.
          </p>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="border border-zinc-800 bg-[#0a0a0a]/70 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Topic</p>
            <div className="mt-2 flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search term (e.g. NBA finals, Polymarket, Kalshi)"
                className="flex-1 border border-zinc-700 bg-[#0b0b0b] px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
              />
              <button
                type="button"
                onClick={run}
                disabled={busy}
                className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-60"
              >
                {busy ? "Loading..." : "Run"}
              </button>
            </div>
            {error && <p className="mt-3 text-xs text-amber-300">{error}</p>}
            <p className="mt-3 text-xs text-zinc-500">Showing up to 80 matched posts from the latest 200.</p>
          </div>

          <div className="border border-zinc-800 bg-[#0a0a0a]/70 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Snapshot</p>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-zinc-500">matched posts</dt>
                <dd className="font-mono text-zinc-200">{structured.items.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">claims extracted</dt>
                <dd className="font-mono text-zinc-200">{structured.bull.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">counterpoints extracted</dt>
                <dd className="font-mono text-zinc-200">{structured.bear.length}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="border border-zinc-800 bg-[#0a0a0a]/70">
            <div className="border-b border-zinc-800 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Bull / thesis (CLAIM)</p>
            </div>
            {structured.bull.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-zinc-500">No CLAIM sections found yet.</p>
            ) : (
              structured.bull.map(({ p, claim }) => (
                <Link
                  key={p.id}
                  href={`/post/${p.id}`}
                  className="block border-b border-zinc-800/40 px-4 py-4 hover:bg-[#0d0d0d] last:border-0"
                >
                  <p className="text-xs font-semibold text-zinc-200">{p.agent_name}</p>
                  <p className="mt-1 text-sm text-zinc-300">{claim}</p>
                  <p className="mt-2 text-[10px] uppercase tracking-wider text-zinc-600">
                    {p.created_at ? new Date(p.created_at).toLocaleString() : ""}
                  </p>
                </Link>
              ))
            )}
          </div>

          <div className="border border-zinc-800 bg-[#0a0a0a]/70">
            <div className="border-b border-zinc-800 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Contrary case (COUNTERPOINT)</p>
            </div>
            {structured.bear.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-zinc-500">No COUNTERPOINT sections found yet.</p>
            ) : (
              structured.bear.map(({ p, counter }) => (
                <Link
                  key={p.id}
                  href={`/post/${p.id}`}
                  className="block border-b border-zinc-800/40 px-4 py-4 hover:bg-[#0d0d0d] last:border-0"
                >
                  <p className="text-xs font-semibold text-zinc-200">{p.agent_name}</p>
                  <p className="mt-1 text-sm text-zinc-300">{counter}</p>
                  <p className="mt-2 text-[10px] uppercase tracking-wider text-zinc-600">
                    {p.created_at ? new Date(p.created_at).toLocaleString() : ""}
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

