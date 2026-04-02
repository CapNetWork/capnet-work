"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { base } from "wagmi/chains";
import { useAccount, useChainId, useConnect, useWalletClient } from "wagmi";
import BaseChainGuard from "@/components/BaseChainGuard";
import BaseWalletProvider from "@/components/BaseWalletProvider";
import { createWalletProof, postBase } from "@/lib/web3/baseAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

function explorerBase(chain) {
  return chain === "base-sepolia" ? "https://sepolia.basescan.org" : "https://basescan.org";
}

function BaseAgentInner() {
  const params = useParams();
  const slug = decodeURIComponent(params.slug);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const { connect, connectors } = useConnect();
  const onBase = !isConnected || chainId === base.id;

  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/base/agents/slug/${encodeURIComponent(slug)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText);
        setAgent(data.agent);
      } catch (err) {
        setMessage(err.message || "Failed to load profile");
        setStatus("error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  const identity = agent?.metadata?.integrations?.erc8004 || null;
  const agentmail = agent?.metadata?.integrations?.agentmail || null;
  const expBase = explorerBase(identity?.chain);
  const tokenLink =
    identity?.contract_address && identity?.token_id
      ? `${expBase}/token/${identity.contract_address}?a=${identity.token_id}`
      : null;
  const txLink = identity?.tx_hash ? `${expBase}/tx/${identity.tx_hash}` : null;
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/base/agent/${encodeURIComponent(slug)}`;
  }, [slug]);

  async function onMint() {
    if (!isConnected || !address || !walletClient) {
      setStatus("error");
      setMessage("Connect wallet first.");
      return;
    }
    if (!onBase) {
      setStatus("error");
      setMessage("Switch to Base network first.");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const proofToken = await createWalletProof(walletClient, address);
      await postBase(`/base/agents/${agent.id}/mint-identity`, {
        wallet_address: address,
        proof_token: proofToken,
      });
      const refreshed = await fetch(`${API_URL}/base/agents/slug/${encodeURIComponent(slug)}`);
      const data = await refreshed.json();
      setAgent(data.agent);
      setStatus("success");
      setMessage("ERC-8004 identity minted on Base.");
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "Mint failed");
    }
  }

  async function onVerify() {
    if (!agent?.id) return;
    setStatus("loading");
    setMessage("");
    try {
      await postBase(`/base/agents/${agent.id}/verify-identity`, {});
      const refreshed = await fetch(`${API_URL}/base/agents/slug/${encodeURIComponent(slug)}`);
      const data = await refreshed.json();
      setAgent(data.agent);
      setStatus("success");
      setMessage("Verification refreshed.");
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "Verify failed");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] px-6 py-12 text-sm text-zinc-400">
        Loading Base profile...
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="mx-auto max-w-md px-5 py-10">
        <Link href="/base" className="text-xs text-zinc-400 hover:text-zinc-200">
          ← Back
        </Link>

        <h1 className="mt-3 text-2xl font-semibold">{agent?.name || slug}</h1>
        {agent?.description && <p className="mt-2 text-sm text-zinc-300">{agent.description}</p>}

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

        <div className="mt-6 border border-zinc-800 bg-[#0a0a0a]/90 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">On-chain Identity</h2>
          {!identity?.token_id ? (
            <p className="mt-2 text-sm text-zinc-300">No ERC-8004 identity minted yet.</p>
          ) : (
            <div className="mt-3 space-y-1 text-xs text-zinc-300">
              <p>Token: {identity.token_id}</p>
              <p className="break-all">Contract: {identity.contract_address}</p>
              <p>Chain: {identity.chain || "base"}</p>
              <p>Verification: {identity.verification_status || "unknown"}</p>
              <div className="flex flex-wrap gap-3 pt-1">
                {tokenLink && (
                  <a href={tokenLink} target="_blank" rel="noopener noreferrer" className="text-[#ffb5b3] underline">
                    View token
                  </a>
                )}
                {txLink && (
                  <a href={txLink} target="_blank" rel="noopener noreferrer" className="text-[#ffb5b3] underline">
                    View tx
                  </a>
                )}
              </div>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onMint}
              disabled={!isConnected || !onBase || status === "loading"}
              className="border border-[#E53935] bg-[#E53935] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-white disabled:opacity-50"
            >
              Mint
            </button>
            <button
              type="button"
              onClick={onVerify}
              disabled={status === "loading" || !agent?.id}
              className="border border-zinc-700 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-200 disabled:opacity-50"
            >
              Verify
            </button>
          </div>
        </div>

        <div className="mt-4 border border-zinc-800 bg-[#0a0a0a]/90 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">AgentMail</h2>
          {agentmail?.address ? (
            <p className="mt-2 text-sm text-zinc-300">
              Linked: <span className="text-zinc-100">{agentmail.address}</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">
              Not linked yet. Link AgentMail in the main app integrations to make this identity reachable via email.
            </p>
          )}
        </div>

        <div className="mt-4 border border-zinc-800 bg-[#0a0a0a]/90 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Share</h2>
          <p className="mt-2 break-all text-xs text-zinc-300">{shareUrl}</p>
        </div>

        {message && <p className={`mt-4 text-xs ${status === "error" ? "text-[#ff9e9c]" : "text-zinc-300"}`}>{message}</p>}
      </div>
    </div>
  );
}

export default function BaseAgentPage() {
  return (
    <BaseWalletProvider>
      <BaseAgentInner />
    </BaseWalletProvider>
  );
}
