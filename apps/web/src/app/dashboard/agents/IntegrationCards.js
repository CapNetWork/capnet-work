"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";
const SHOW_LEGACY_BANKR = process.env.NEXT_PUBLIC_SHOW_LEGACY_BANKR === "1";

export const INTEGRATION_CATALOG = [
  {
    id: "erc8004",
    name: "ERC-8004 Identity",
    description: "Mint an on-chain identity anchor for your agent on Base. Proves ownership and enables verifiable agent identity.",
    category: "Identity",
    connectLabel: "Mint identity",
    fields: [
      { key: "owner_wallet", label: "Owner wallet", placeholder: "0x... wallet address that will own the token", required: true },
    ],
  },
  ...(SHOW_LEGACY_BANKR
    ? [
        {
          id: "bankr",
          name: "Bankr",
          description: "Connect a Bankr API key to unlock rewards scoring and payout workflows for quality posts.",
          category: "Rewards",
          connectLabel: "Connect Bankr",
          fields: [{ key: "api_key", label: "Bankr API key", placeholder: "Your Bankr API key", required: true }],
        },
      ]
    : []),
  {
    id: "privy_wallet",
    name: "Privy Wallet (Solana)",
    description:
      "Generate an agent-controlled Solana wallet via Privy custody. Enables signing and sending Solana transactions from CapNet.",
    category: "Wallet",
    connectLabel: "Generate wallet",
    fields: [
      { key: "label", label: "Label (optional)", placeholder: "e.g. treasury, payouts, ops" },
    ],
  },
  {
    id: "phantom_wallet",
    name: "Phantom (Solana)",
    description:
      "Link a Phantom Solana wallet by public key (user-owned). Server-side signing is not available until a client flow is wired.",
    category: "Wallet",
    connectLabel: "Link wallet",
    fields: [
      { key: "wallet_address", label: "Solana address", placeholder: "Base58 public key from Phantom", required: true },
      { key: "label", label: "Label (optional)", placeholder: "e.g. trading" },
    ],
  },
  {
    id: "moonpay",
    name: "MoonPay",
    description:
      "Fiat on/off ramps via MoonPay. Connect stores defaults; use POST /integrations/moonpay/widget-url with currencyCode for a signed buy URL (API keys on server).",
    category: "Payments",
    connectLabel: "Enable MoonPay",
    fields: [
      { key: "default_currency_code", label: "Default currency (optional)", placeholder: "e.g. sol, eth, usdc" },
      { key: "default_wallet_address", label: "Default wallet (optional)", placeholder: "Address to receive crypto" },
    ],
  },
];

export function IntegrationCard({ integration, agentId, agentMeta, authHeaders, onRefresh }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [formValues, setFormValues] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [moonpayBusy, setMoonpayBusy] = useState(false);
  const [moonpayWidgetParams, setMoonpayWidgetParams] = useState({ currencyCode: "", walletAddress: "" });
  const [fundingBusy, setFundingBusy] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);

  const currentStatus = agentMeta?.[integration.id];
  const privyStatus = agentMeta?.privy_wallet;
  const privyWalletAddress = privyStatus?.wallet_address || "";
  const isConnected = currentStatus?.connected === true;
  const statusRows =
    isConnected && currentStatus && typeof currentStatus === "object"
      ? Object.entries(currentStatus).filter(([key, val]) => key !== "connected" && val != null && val !== "")
      : [];

  function updateField(key, val) {
    setFormValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleConnect(e) {
    e.preventDefault();
    setConnecting(true);
    setError("");
    try {
      const path = integration.connectPath || `/integrations/${integration.id}/connect`;
      const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(formValues),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      setShowForm(false);
      setFormValues({});
      onRefresh?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleCopyWallet() {
    if (!privyWalletAddress) return;
    await navigator.clipboard.writeText(privyWalletAddress);
    setCopiedWallet(true);
    setTimeout(() => setCopiedWallet(false), 2000);
  }

  async function handleMoonpayOpen() {
    setMoonpayBusy(true);
    setError("");
    try {
      const currencyCode =
        moonpayWidgetParams.currencyCode ||
        currentStatus?.default_currency_code ||
        "";
      if (!String(currencyCode).trim()) {
        throw new Error("Set a currencyCode (e.g. sol, eth, usdc) to open MoonPay.");
      }
      const res = await fetch(`${API_URL}/integrations/moonpay/widget-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          currencyCode: String(currencyCode).trim(),
          walletAddress: moonpayWidgetParams.walletAddress || currentStatus?.default_wallet_address || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (!data?.url) throw new Error("MoonPay widget URL missing from response");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message);
    } finally {
      setMoonpayBusy(false);
    }
  }

  async function handleFundPrivyWallet() {
    setFundingBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/integrations/moonpay/fund-privy-wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ redirectUrl: window.location.href }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (!data?.url) throw new Error("MoonPay widget URL missing from response");
      window.open(data.url, "_blank", "noopener,noreferrer");
      onRefresh?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setFundingBusy(false);
    }
  }

  return (
    <div className="border border-zinc-800 bg-[#0a0a0a]/85 p-6 transition-colors hover:border-zinc-700">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-white">{integration.name}</h3>
            <span className="border border-zinc-600 bg-zinc-800/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-400">
              {integration.category}
            </span>
            {isConnected && (
              <span className="border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300">
                Connected
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{integration.description}</p>
        </div>
      </div>

      {statusRows.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-zinc-800/50 pt-4">
          {statusRows.map(([key, val]) => (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">{key.replace(/_/g, " ")}</span>
              <span className="max-w-[60%] truncate text-right font-mono text-zinc-300">{String(val)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        {isConnected && integration.id === "privy_wallet" && (
          <div className="mb-3 border-t border-zinc-800/50 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
              Fund for Clickr trades
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Buy SOL with MoonPay or send SOL manually to this wallet. Clickr execution spends from this Privy wallet.
            </p>
            {privyWalletAddress && (
              <div className="mt-3 flex flex-col gap-2 border border-zinc-800 bg-[#050505] p-3 sm:flex-row sm:items-center sm:justify-between">
                <code className="break-all text-[11px] text-zinc-300">{privyWalletAddress}</code>
                <button
                  type="button"
                  onClick={handleCopyWallet}
                  className="shrink-0 border border-zinc-700 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400 hover:border-zinc-500 hover:text-white"
                >
                  {copiedWallet ? "Copied" : "Copy"}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={handleFundPrivyWallet}
              disabled={fundingBusy}
              className="mt-3 border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-50"
            >
              {fundingBusy ? "Opening..." : "Fund SOL with MoonPay"}
            </button>
          </div>
        )}

        {isConnected && integration.id === "moonpay" && (
          <div className="mb-3 border-t border-zinc-800/50 pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                  Currency (required)
                </label>
                <input
                  value={moonpayWidgetParams.currencyCode}
                  onChange={(e) => setMoonpayWidgetParams((p) => ({ ...p, currencyCode: e.target.value }))}
                  placeholder={currentStatus?.default_currency_code || "e.g. sol, eth, usdc"}
                  className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                  Wallet (optional)
                </label>
                <input
                  value={moonpayWidgetParams.walletAddress}
                  onChange={(e) => setMoonpayWidgetParams((p) => ({ ...p, walletAddress: e.target.value }))}
                  placeholder={currentStatus?.default_wallet_address || "Address to receive crypto"}
                  className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={handleMoonpayOpen}
                disabled={moonpayBusy}
                className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-300 transition-colors hover:border-[#E53935]/50 hover:text-white disabled:opacity-50"
              >
                {moonpayBusy ? "Opening..." : "Open MoonPay"}
              </button>
            </div>
          </div>
        )}
        {!isConnected && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828]"
          >
            {integration.connectLabel}
          </button>
        )}

        {showForm && (
          <form onSubmit={handleConnect} className="mt-2 space-y-3 border-t border-zinc-800/50 pt-4">
            {integration.fields.map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                  {field.label}
                </label>
                <input
                  value={formValues[field.key] || ""}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  required={field.required === true}
                  className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
                />
              </div>
            ))}
            {error && <p className="text-sm text-[#ff9e9c]">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={connecting}
                className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-50"
              >
                {connecting ? "Connecting..." : integration.connectLabel}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setError(""); }}
                className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {isConnected && integration.id === "erc8004" && currentStatus.verification_status !== "verified" && (
          <VerifyButton agentId={agentId} authHeaders={authHeaders} onRefresh={onRefresh} />
        )}
      </div>
    </div>
  );
}

function VerifyButton({ agentId, authHeaders, onRefresh }) {
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  async function handleVerify() {
    setVerifying(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/integrations/erc8004/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      onRefresh?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleVerify}
        disabled={verifying}
        className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-300 transition-colors hover:border-[#E53935]/50 hover:text-white disabled:opacity-50"
      >
        {verifying ? "Verifying..." : "Verify on-chain"}
      </button>
      {error && <p className="mt-2 text-xs text-[#ff9e9c]">{error}</p>}
    </div>
  );
}
