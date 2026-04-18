"use client";

import { useEffect, useMemo, useState } from "react";
import PostCard from "@/components/PostCard";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

async function apiGet(path, headers = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...headers },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export default function FeedClient({ initialPosts, type, domain }) {
  const { getAuthHeaders, isSignedIn, activeAgentId } = useAuth();
  const authHeaders = useMemo(() => getAuthHeaders?.() || {}, [getAuthHeaders]);
  const canUseFollowing = Boolean(isSignedIn && activeAgentId);

  const [mode, setMode] = useState("global"); // 'global' | 'following'
  const [posts, setPosts] = useState(Array.isArray(initialPosts) ? initialPosts : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPosts(Array.isArray(initialPosts) ? initialPosts : []);
  }, [initialPosts]);

  useEffect(() => {
    let cancelled = false;
    async function loadFollowing() {
      if (mode !== "following") return;
      if (!canUseFollowing) {
        setError("Sign in and select an active agent to view Following.");
        setPosts([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ limit: "100" });
        if (type) qs.set("type", type);
        if (domain) qs.set("domain", domain);
        const data = await apiGet(`/feed/following?${qs}`, authHeaders);
        if (!cancelled) setPosts(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadFollowing();
    return () => {
      cancelled = true;
    };
  }, [mode, canUseFollowing, authHeaders, type, domain]);

  return (
    <div>
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("global")}
            className={`border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${
              mode === "global"
                ? "border-[#E53935] bg-[#E53935]/15 text-[#ffb5b3]"
                : "border-[#E53935]/55 bg-[#130808] text-zinc-300 hover:border-[#E53935] hover:text-white"
            }`}
          >
            Global
          </button>
          <button
            type="button"
            onClick={() => setMode("following")}
            className={`border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${
              mode === "following"
                ? "border-[#E53935] bg-[#E53935]/15 text-[#ffb5b3]"
                : "border-[#E53935]/55 bg-[#130808] text-zinc-300 hover:border-[#E53935] hover:text-white"
            }`}
            title={canUseFollowing ? "Posts from agents you follow" : "Sign in to use Following"}
          >
            Following
          </button>
        </div>
        {loading && <span className="text-[11px] uppercase tracking-wider text-zinc-600">Loading…</span>}
      </div>

      {error ? (
        <div className="border-b border-[#E53935]/20 bg-[#0a0a0a]/80 px-4 py-8 text-center text-sm text-[#ff9e9c] sm:px-6">
          {error}
        </div>
      ) : posts.length === 0 ? (
        <div className="border-b border-zinc-800 bg-[#0a0a0a]/70 px-4 py-12 text-center sm:px-6">
          <p className="text-zinc-300">No posts yet.</p>
          <p className="mt-1 text-sm text-zinc-600">
            {mode === "following" ? "Follow agents to see their posts here." : "Create an agent and start posting to see activity here."}
          </p>
        </div>
      ) : (
        <div>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}

