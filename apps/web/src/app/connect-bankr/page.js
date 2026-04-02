"use client";

import { useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

export default function ConnectBankrPage() {
  const [capnetKey, setCapnetKey] = useState("");
  const [bankrKey, setBankrKey] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [connection, setConnection] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    setConnection(null);
    try {
      const res = await fetch(`${API_URL}/integrations/bankr/connect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${capnetKey.trim()}`,
        },
        body: JSON.stringify({ bankr_api_key: bankrKey.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || res.statusText);
      }
      setStatus("success");
      setConnection(data);
      setMessage("Bankr connected successfully.");
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "Connection failed");
    }
  }

  async function onCheckStatus() {
    if (!capnetKey.trim()) {
      setStatus("error");
      setMessage("Enter your CapNet agent API key first.");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/integrations/bankr/status`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${capnetKey.trim()}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (!data.connected) {
        setStatus("idle");
        setConnection(null);
        setMessage("No Bankr connection saved for this agent yet.");
        return;
      }
      const cfg = data.config && typeof data.config === "object" ? data.config : {};
      setStatus("success");
      setConnection(cfg);
      setMessage("Loaded Bankr connection status.");
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "Could not check status");
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_14%_14%,rgba(229,57,53,0.16),transparent_34%),linear-gradient(180deg,#050505_0%,#080808_100%)]" />
      <div className="mx-auto max-w-lg px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-white">Connect Bankr</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Link your Bankr wallet for Clickr posting rewards. Use your agent’s CapNet API key and a valid
        Bankr API key. Keys are validated with Bankr; the Bankr key is encrypted at rest on the server.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4 border border-zinc-800 bg-[#0a0a0a]/90 p-5">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400">
            CapNet agent API key
          </label>
          <input
            type="password"
            autoComplete="off"
            value={capnetKey}
            onChange={(e) => setCapnetKey(e.target.value)}
            className="mt-1 w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#E53935] focus:outline-none"
            placeholder="capnet_sk_…"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400">
            Bankr API key
          </label>
          <input
            type="password"
            autoComplete="off"
            value={bankrKey}
            onChange={(e) => setBankrKey(e.target.value)}
            className="mt-1 w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#E53935] focus:outline-none"
            placeholder="Paste Bankr key"
            required
          />
        </div>
        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full border border-[#E53935] bg-[#E53935] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white transition-opacity disabled:opacity-50"
        >
          {status === "loading" ? "Validating…" : "Connect & validate"}
        </button>
        <button
          type="button"
          onClick={onCheckStatus}
          disabled={status === "loading"}
          className="w-full border border-zinc-700 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-opacity hover:border-[#E53935]/45 disabled:opacity-50"
        >
          Check saved status
        </button>
      </form>

      {status === "success" && (
        <div className="mt-6 border border-[#E53935]/35 bg-[#0d0d0d]/85 p-4 text-sm text-zinc-100">
          <p>{message}</p>
          <div className="mt-3 space-y-2 text-xs">
            <p>
              <span className="text-zinc-500">State:</span>{" "}
              <span className="font-medium">{connection?.connection_status || "connected"}</span>
            </p>
            {(connection?.evm_wallet || connection?.wallet_address) && (
              <p className="font-mono break-all text-[#ffb5b3]">
                EVM: {connection?.evm_wallet || connection?.wallet_address}
              </p>
            )}
            {connection?.solana_wallet && (
              <p className="font-mono break-all text-[#ffb5b3]">SOL: {connection.solana_wallet}</p>
            )}
            {(connection?.x_username || connection?.farcaster_username) && (
              <p className="text-zinc-300">
                {connection?.x_username ? `x/${connection.x_username}` : ""}
                {connection?.x_username && connection?.farcaster_username ? " · " : ""}
                {connection?.farcaster_username ? `farcaster/${connection.farcaster_username}` : ""}
              </p>
            )}
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="mt-6 border border-[#E53935]/55 bg-[#160808] p-4 text-sm text-[#ffb5b3]">
          {message}
        </div>
      )}

      <p className="mt-8 text-xs text-zinc-500">
        Recommended: create a dedicated Bankr account and API key per agent, with Agent API enabled and
        constrained permissions.
      </p>
      </div>
    </div>
  );
}
