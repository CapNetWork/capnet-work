"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

function getExplorerBase(chain) {
  if (chain === "base-sepolia") return "https://sepolia.basescan.org";
  return "https://basescan.org";
}

export default function OnchainIdentityCard({ initialConfig }) {
  const { isSignedIn, getAuthHeaders } = useAuth();
  const [ownerWallet, setOwnerWallet] = useState(initialConfig?.owner_wallet || "");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [config, setConfig] = useState(initialConfig || null);

  const explorerBase = useMemo(() => getExplorerBase(config?.chain), [config?.chain]);
  const explorerTokenUrl =
    config?.contract_address && config?.token_id
      ? `${explorerBase}/token/${config.contract_address}?a=${config.token_id}`
      : null;
  const explorerTxUrl = config?.tx_hash ? `${explorerBase}/tx/${config.tx_hash}` : null;

  async function withAuth(path, options = {}) {
    const headers = getAuthHeaders();
    if (!Object.keys(headers).length) {
      throw new Error("Sign in to continue.");
    }
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...headers,
        ...(options.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  async function onMint() {
    setStatus("loading");
    setMessage("");
    try {
      const data = await withAuth("/integrations/erc8004/connect", {
        method: "POST",
        body: JSON.stringify({ owner_wallet: ownerWallet.trim() }),
      });
      const cfg = data?.config && typeof data.config === "object" ? data.config : data;
      setConfig(cfg);
      setStatus("success");
      setMessage("On-chain identity minted successfully.");
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "Mint failed");
    }
  }

  async function onVerify() {
    setStatus("loading");
    setMessage("");
    try {
      const data = await withAuth("/integrations/erc8004/verify", { method: "POST" });
      const cfg = data?.config && typeof data.config === "object" ? data.config : config;
      setConfig(cfg);
      setStatus("success");
      setMessage(data.verified ? "Identity ownership verified." : "Identity owner mismatch detected.");
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "Verification failed");
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800/60 bg-[#0a0a0a]/70 p-6">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">On-chain Identity</h3>

      {!config?.token_id ? (
        <p className="mt-2 text-sm text-zinc-300">Mint an ERC-8004 identity anchor for this agent on Base.</p>
      ) : (
        <div className="mt-3 space-y-1 text-xs text-zinc-300">
          <p>
            <span className="text-zinc-500">Token ID:</span> {config.token_id}
          </p>
          <p className="break-all">
            <span className="text-zinc-500">Contract:</span> {config.contract_address}
          </p>
          <p>
            <span className="text-zinc-500">Chain:</span> {config.chain || "base"}
          </p>
          <p className="break-all">
            <span className="text-zinc-500">Owner:</span> {config.owner_wallet}
          </p>
          {config.verification_status && (
            <p>
              <span className="text-zinc-500">Verification:</span>{" "}
              <span
                className={
                  config.verification_status === "verified"
                    ? "text-[#ffb5b3]"
                    : config.verification_status === "mismatch"
                      ? "text-amber-300"
                      : "text-zinc-300"
                }
              >
                {config.verification_status}
              </span>
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-3">
            {explorerTokenUrl && (
              <a
                href={explorerTokenUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#ffb5b3] underline decoration-[#E53935]/50 underline-offset-2"
              >
                View token
              </a>
            )}
            {explorerTxUrl && (
              <a
                href={explorerTxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#ffb5b3] underline decoration-[#E53935]/50 underline-offset-2"
              >
                View mint tx
              </a>
            )}
          </div>
        </div>
      )}

      {!isSignedIn && (
        <p className="mt-4 text-xs text-zinc-500">
          <a href="/signin" className="text-[#ffb5b3] underline">Sign in</a> to mint or verify identity.
        </p>
      )}

      {isSignedIn && (
        <>
          <div className="mt-4">
            <input
              type="text"
              value={ownerWallet}
              onChange={(e) => setOwnerWallet(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-[#050505] px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-[#E53935] focus:outline-none"
              placeholder="Owner wallet (0x...)"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onMint}
              disabled={status === "loading"}
              className="rounded-md border border-[#E53935] bg-[#E53935] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-50"
            >
              {status === "loading" ? "Processing..." : config?.token_id ? "Remint Identity" : "Mint On-chain Identity"}
            </button>
            <button
              type="button"
              onClick={onVerify}
              disabled={status === "loading" || !config?.token_id}
              className="rounded-md border border-zinc-700 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-200 transition-colors hover:border-zinc-500 disabled:opacity-50"
            >
              Verify ownership
            </button>
          </div>
        </>
      )}

      {message && (
        <p className={`mt-3 text-xs ${status === "error" ? "text-[#ff9e9c]" : "text-zinc-300"}`}>{message}</p>
      )}
    </div>
  );
}
