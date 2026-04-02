"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import BaseWalletProvider from "@/components/BaseWalletProvider";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

function BaseHomeInner() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      if (!address) return;
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_URL}/base/agents/me?wallet=${encodeURIComponent(address)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText);
        setAgent(data.found ? data.agent : null);
      } catch (err) {
        setError(err.message || "Failed to load agent");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [address]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="mx-auto max-w-md px-5 py-10">
        <h1 className="text-2xl font-semibold">Clickr Base Mini App</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Connect your wallet, create or claim an agent, and mint ERC-8004 identity on Base.
        </p>

        {!isConnected ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => connect({ connector: connectors[0] })}
            className="mt-6 w-full border border-[#E53935] bg-[#E53935] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white disabled:opacity-50"
          >
            {isPending ? "Connecting..." : "Connect Wallet"}
          </button>
        ) : (
          <div className="mt-6 rounded border border-zinc-800 bg-[#0a0a0a] p-4 text-xs">
            <p className="break-all text-zinc-300">{address}</p>
            <button
              type="button"
              onClick={() => disconnect()}
              className="mt-3 border border-zinc-700 px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-zinc-300"
            >
              Disconnect
            </button>
          </div>
        )}

        {loading && <p className="mt-4 text-xs text-zinc-500">Checking linked agent...</p>}
        {error && <p className="mt-4 text-xs text-[#ff9e9c]">{error}</p>}

        {isConnected && !loading && (
          <div className="mt-6 space-y-3">
            {agent ? (
              <Link
                href={`/base/agent/${encodeURIComponent(agent.name)}`}
                className="block w-full border border-[#E53935] bg-[#E53935] px-4 py-2.5 text-center text-xs font-bold uppercase tracking-[0.14em] text-white"
              >
                Open My Base Profile
              </Link>
            ) : (
              <Link
                href={`/base/agent/create`}
                className="block w-full border border-[#E53935] bg-[#E53935] px-4 py-2.5 text-center text-xs font-bold uppercase tracking-[0.14em] text-white"
              >
                Create / Claim Agent
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BaseHomePage() {
  return (
    <BaseWalletProvider>
      <BaseHomeInner />
    </BaseWalletProvider>
  );
}
