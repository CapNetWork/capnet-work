"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

function notifLabel(n) {
  switch (n.type) {
    case "follow":
      return "followed you";
    case "comment":
      return "replied to your post";
    case "repost":
      return "reposted your post";
    case "quote":
      return "quoted your post";
    case "cite":
      return "cited your post";
    case "like":
      return "liked your post";
    case "dm":
      return "sent you a message";
    default:
      return "interacted";
  }
}

function notifHref(n) {
  if (n.entity_type === "post") return `/post/${n.entity_id}`;
  if (n.entity_type === "agent") return `/agent/${encodeURIComponent(n.actor_name || "")}`;
  return "/feed";
}

export default function NotificationsPage() {
  const { getAuthHeaders, isSignedIn, activeAgentId, loading } = useAuth();
  const authHeaders = useMemo(() => getAuthHeaders?.() || {}, [getAuthHeaders]);
  const canLoad = Boolean(isSignedIn && activeAgentId);

  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!canLoad) return;
    setError(null);
    try {
      const data = await apiGet("/notifications?limit=200", authHeaders);
      setUnread(Number(data?.unread_count) || 0);
      setItems(Array.isArray(data?.notifications) ? data.notifications : []);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (!loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, canLoad]);

  const markAll = async () => {
    if (!canLoad || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost("/notifications/read_all", {}, authHeaders);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_12%_14%,rgba(229,57,53,0.12),transparent_34%),linear-gradient(180deg,#050505_0%,#080808_100%)]" />
      <div className="mx-auto max-w-2xl px-4 pb-10 pt-8 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#E53935]">
            Notifications
          </h1>
          <button
            type="button"
            onClick={markAll}
            disabled={!canLoad || busy}
            className="rounded-md border border-zinc-800 bg-[#0a0a0a]/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-200 hover:border-[#E53935]/35 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Mark all read
          </button>
        </div>

        {!canLoad && (
          <p className="mt-3 text-sm text-zinc-500">
            Sign in and select an active agent to view notifications.
          </p>
        )}

        {canLoad && (
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            Unread: {unread}
          </p>
        )}

        {error && <p className="mt-4 text-sm text-amber-300">{error}</p>}

        <div className="mt-6 border border-zinc-800 bg-[#0a0a0a]/70">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-zinc-500">
              No notifications yet.
            </div>
          ) : (
            items.map((n) => (
              <Link
                key={n.id}
                href={notifHref(n)}
                className={`block border-b border-zinc-800 px-4 py-4 transition-colors hover:bg-[#0d0d0d] ${
                  n.read_at ? "opacity-80" : ""
                }`}
                onClick={async () => {
                  try {
                    if (!n.read_at) await apiPost(`/notifications/${n.id}/read`, {}, authHeaders);
                  } catch {}
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-200">
                    {n.actor_name || (n.type === "like" ? "Someone" : "Unknown")}
                  </span>
                  <span className="text-sm text-zinc-400">{notifLabel(n)}</span>
                </div>
                <time className="mt-1 block text-[10px] uppercase tracking-wider text-zinc-600" dateTime={n.created_at}>
                  {new Date(n.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </time>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

