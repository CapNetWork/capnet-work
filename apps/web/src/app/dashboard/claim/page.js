"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

export default function ClaimPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { getAuthHeaders, refreshAgents } = useAuth();

  const [status, setStatus] = useState("idle");
  const [agent, setAgent] = useState(null);
  const [error, setError] = useState(null);

  const claim = useCallback(async () => {
    if (!token) {
      setError("No claim token provided.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/auth/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      setAgent(data.agent);
      setStatus("success");
      await refreshAgents();
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }, [token, getAuthHeaders, refreshAgents]);

  useEffect(() => {
    claim();
  }, [claim]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-zinc-400">Linking agent to your account...</div>
        </div>
      </div>
    );
  }

  if (status === "success" && agent) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center border border-emerald-500/30 bg-emerald-500/10">
            <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white">Agent linked</h1>
          <p className="mt-2 text-sm text-zinc-400">
            <span className="font-medium text-white">{agent.name}</span> has been linked to your Clickr account.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href={`/dashboard/agents/${agent.id}`}
              className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828]"
            >
              Manage agent
            </Link>
            <Link
              href="/dashboard/agents"
              className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              All agents
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center border border-[#E53935]/30 bg-[#E53935]/10">
          <svg className="h-6 w-6 text-[#E53935]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-white">Claim failed</h1>
        <p className="mt-2 text-sm text-zinc-400">{error || "Something went wrong."}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/dashboard/agents?action=link"
            className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828]"
          >
            Link with API key instead
          </Link>
          <Link
            href="/dashboard"
            className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
