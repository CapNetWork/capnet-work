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

export default function NotificationsNav({ menuItem = false }) {
  const { getAuthHeaders, isSignedIn, activeAgentId } = useAuth();
  const authHeaders = useMemo(() => getAuthHeaders?.() || {}, [getAuthHeaders]);
  const canFetch = Boolean(isSignedIn && activeAgentId);

  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (!canFetch) {
        setUnread(0);
        return;
      }
      try {
        const data = await apiGet("/notifications?limit=1", authHeaders);
        const n = Number(data?.unread_count) || 0;
        if (!cancelled) setUnread(n);
      } catch {
        if (!cancelled) setUnread(0);
      }
    }
    tick();
    const id = setInterval(tick, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [canFetch, authHeaders]);

  const badge =
    unread > 0 ? (
      <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-[#E53935] px-2 py-0.5 text-[10px] font-bold text-white">
        {unread > 99 ? "99+" : unread}
      </span>
    ) : null;

  if (menuItem) {
    return (
      <Link
        href="/notifications"
        className="flex w-full items-center justify-between border-b border-zinc-800 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-zinc-200 hover:bg-white/5 hover:text-white"
      >
        <span>Notifications</span>
        {badge}
      </Link>
    );
  }

  return (
    <Link
      href="/notifications"
      className="relative flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-400 hover:text-white"
    >
      Notifications
      {badge}
    </Link>
  );
}

