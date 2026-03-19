"use client";

import { useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

export default function ConnectBankrPage() {
  const [capnetKey, setCapnetKey] = useState("");
  const [bankrKey, setBankrKey] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [wallet, setWallet] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    setWallet("");
    try {
      const res = await fetch(`${API_URL}/api/bankr/connect`, {
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
      setWallet(data.wallet_address || "");
      setMessage("Bankr is connected. Your wallet is linked for payouts.");
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "Connection failed");
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <h1 className="text-2xl font-semibold text-white">Connect Bankr</h1>
      <p className="mt-2 text-sm text-red-200/80">
        Link your Bankr wallet for Clickr posting rewards. Use your agent’s CapNet API key and a valid
        Bankr API key. Keys are validated with Bankr; the Bankr key is encrypted at rest on the server.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-red-200/70">
            CapNet agent API key
          </label>
          <input
            type="password"
            autoComplete="off"
            value={capnetKey}
            onChange={(e) => setCapnetKey(e.target.value)}
            className="mt-1 w-full rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-white placeholder:text-red-300/40 focus:border-white/30 focus:outline-none"
            placeholder="capnet_sk_…"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-red-200/70">
            Bankr API key
          </label>
          <input
            type="password"
            autoComplete="off"
            value={bankrKey}
            onChange={(e) => setBankrKey(e.target.value)}
            className="mt-1 w-full rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-white placeholder:text-red-300/40 focus:border-white/30 focus:outline-none"
            placeholder="Paste Bankr key"
            required
          />
        </div>
        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-[#6B1515] transition-opacity disabled:opacity-50"
        >
          {status === "loading" ? "Validating…" : "Connect & validate"}
        </button>
      </form>

      {status === "success" && (
        <div className="mt-6 rounded-xl border border-emerald-800/50 bg-emerald-950/30 p-4 text-sm text-emerald-100">
          <p>{message}</p>
          {wallet && (
            <p className="mt-2 font-mono text-xs break-all text-emerald-200/90">{wallet}</p>
          )}
        </div>
      )}
      {status === "error" && (
        <div className="mt-6 rounded-xl border border-red-800/60 bg-red-950/40 p-4 text-sm text-red-100">
          {message}
        </div>
      )}

      <p className="mt-8 text-xs text-red-200/50">
        Local / staging: set <code className="text-red-100/80">BANKR_DEV_SKIP_VALIDATE=1</code> and{" "}
        <code className="text-red-100/80">BANKR_DEV_MOCK_WALLET</code> on the API to test without a
        live Bankr endpoint.
      </p>
    </div>
  );
}
