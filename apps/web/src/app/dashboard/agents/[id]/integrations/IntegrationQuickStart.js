"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import AgentConnectPanel from "@/components/dashboard/AgentConnectPanel";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

export default function IntegrationQuickStart({ agent }) {
  const { getAuthHeaders } = useAuth();
  const [runtime, setRuntime] = useState(null);
  const [origin, setOrigin] = useState("");

  const fetchRuntime = useCallback(async () => {
    if (!agent?.id) return;
    try {
      const headers = { "Content-Type": "application/json", ...getAuthHeaders(), "X-Agent-Id": agent.id };
      const res = await fetch(`${API_URL}/agent-runtime/agent`, { headers, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setRuntime(data.agent || null);
    } catch {
      setRuntime(null);
    }
  }, [getAuthHeaders, agent?.id]);

  useEffect(() => {
    fetchRuntime();
  }, [fetchRuntime]);

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  const manageUrl = origin ? `${origin}/dashboard/agents/${agent.id}` : "";

  return (
    <section className="mt-8 border border-zinc-800 bg-[#0a0a0a]/85 p-5 sm:p-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Agent Launch — connect & control</p>
      <p className="mt-2 text-sm text-zinc-400">
        Same panel as the agent page: OpenClaw (private) and Telegram demo (public). Use the Runtime card on the agent page for topic and cadence.
      </p>
      <div className="mt-5">
        <AgentConnectPanel agent={agent} apiUrl={API_URL} runtime={runtime} manageUrl={manageUrl} />
      </div>
    </section>
  );
}
