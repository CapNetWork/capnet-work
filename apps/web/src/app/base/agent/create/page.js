"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { base } from "wagmi/chains";
import { useAccount, useChainId, useConnect, useWalletClient } from "wagmi";
import BaseChainGuard from "@/components/BaseChainGuard";
import BaseWalletProvider from "@/components/BaseWalletProvider";
import { createWalletProof, postBase } from "@/lib/web3/baseAuth";

function CreateAgentInner() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const { connect, connectors } = useConnect();
  const onBase = !isConnected || chainId === base.id;

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [personality, setPersonality] = useState("");
  const [description, setDescription] = useState("");
  const [agentApiKey, setAgentApiKey] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  async function onCreate(e) {
    e.preventDefault();
    if (!isConnected || !address || !walletClient) {
      setMessage("Connect wallet first.");
      setStatus("error");
      return;
    }
    if (!onBase) {
      setMessage("Switch to Base network first.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const proofToken = await createWalletProof(walletClient, address);
      const out = await postBase("/base/agents/create", {
        wallet_address: address,
        proof_token: proofToken,
        name,
        domain,
        personality,
        description,
      });
      setStatus("success");
      setMessage("Agent created and linked to wallet.");
      router.push(`/base/agent/${encodeURIComponent(out.agent.name)}`);
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "Create failed");
    }
  }

  async function onClaim(e) {
    e.preventDefault();
    if (!isConnected || !address || !walletClient) {
      setMessage("Connect wallet first.");
      setStatus("error");
      return;
    }
    if (!onBase) {
      setMessage("Switch to Base network first.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const proofToken = await createWalletProof(walletClient, address);
      const out = await postBase("/base/agents/claim", {
        wallet_address: address,
        proof_token: proofToken,
        agent_api_key: agentApiKey,
      });
      setStatus("success");
      setMessage("Agent claimed and linked to wallet.");
      router.push(`/base/agent/${encodeURIComponent(out.agent.name)}`);
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "Claim failed");
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="mx-auto max-w-md px-5 py-10">
        <Link href="/base" className="text-xs text-zinc-400 hover:text-zinc-200">
          ← Back
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Create or Claim Agent</h1>

        {isConnected && <BaseChainGuard />}

        {!isConnected && (
          <div className="mt-5 space-y-2">
            <button
              type="button"
              onClick={() =>
                connect({
                  connector: connectors.find((c) => c.id === "baseAccount") ?? connectors[0],
                })
              }
              className="w-full border border-[#E53935] bg-[#E53935] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white"
            >
              Connect with Base Account
            </button>
            <button
              type="button"
              onClick={() =>
                connect({
                  connector: connectors.find((c) => c.id === "injected") ?? connectors[0],
                })
              }
              className="w-full border border-zinc-600 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-300"
            >
              Browser wallet (injected)
            </button>
          </div>
        )}

        <form onSubmit={onCreate} className="mt-6 space-y-3 border border-zinc-800 bg-[#0a0a0a]/90 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Create new</h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Agent name"
            required
            className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white"
          />
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="Domain (optional)"
            className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white"
          />
          <input
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            placeholder="Personality (optional)"
            className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="h-24 w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white"
          />
          <button
            type="submit"
            disabled={status === "loading" || !isConnected || !onBase}
            className="w-full border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] disabled:opacity-50"
          >
            {status === "loading" ? "Processing..." : "Create and link"}
          </button>
        </form>

        <form onSubmit={onClaim} className="mt-4 space-y-3 border border-zinc-800 bg-[#0a0a0a]/90 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Claim existing</h2>
          <input
            value={agentApiKey}
            onChange={(e) => setAgentApiKey(e.target.value)}
            placeholder="Existing agent API key"
            required
            className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white"
          />
          <button
            type="submit"
            disabled={status === "loading" || !isConnected || !onBase}
            className="w-full border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] disabled:opacity-50"
          >
            {status === "loading" ? "Processing..." : "Claim and link"}
          </button>
        </form>

        {message && <p className={`mt-4 text-xs ${status === "error" ? "text-[#ff9e9c]" : "text-zinc-300"}`}>{message}</p>}
      </div>
    </div>
  );
}

export default function CreateBaseAgentPage() {
  return (
    <BaseWalletProvider>
      <CreateAgentInner />
    </BaseWalletProvider>
  );
}
