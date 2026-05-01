"use client";

import { useEffect, useState } from "react";
import { addressExplorerUrl, txExplorerUrl, shortTxHash } from "@/lib/solana";
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { IDKitWidget } from "@worldcoin/idkit";

export { INTEGRATION_CATALOG } from "@/lib/integrationCatalog";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";
const WORLD_APP_ID = process.env.NEXT_PUBLIC_WORLD_APP_ID || "";
const WORLD_ACTION_ID = process.env.NEXT_PUBLIC_WORLD_ACTION_ID || "verify-agent";

function StatusRow({ label, value, href }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-zinc-500">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="max-w-[60%] truncate text-right font-mono text-[#ffb5b3] hover:underline"
        >
          {String(value)}
        </a>
      ) : (
        <span className="max-w-[60%] truncate text-right font-mono text-zinc-300">{String(value)}</span>
      )}
    </div>
  );
}

function formatSol(lamports) {
  if (lamports == null) return null;
  const n = Number(lamports);
  if (!Number.isFinite(n)) return null;
  return `${(n / 1_000_000_000).toFixed(4)} SOL`;
}

function PrivyDevnetActions({
  agentId,
  walletAddress,
  balanceSol,
  isPaused,
  pausedReason,
  policy,
  dailySpendLamports,
  authHeaders,
  onRefresh,
  setParentError,
}) {
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  async function loadHistory() {
    try {
      const res = await fetch(`${API_URL}/integrations/privy_wallet/transactions?limit=5`, {
        headers: { "Content-Type": "application/json", ...authHeaders },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setHistory(Array.isArray(data.transactions) ? data.transactions : []);
    } catch {
      setHistory([]);
    }
  }

  useEffect(() => {
    if (walletAddress) void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  async function call(path, body, method = "POST") {
    setBusy(path);
    setResult(null);
    setParentError("");
    try {
      const res = await fetch(`${API_URL}${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: method === "GET" ? undefined : JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const ruleSuffix = data.rule ? ` (${data.rule})` : "";
        throw new Error(`${data.error || res.statusText}${ruleSuffix}`);
      }
      setResult(data);
      onRefresh?.();
      await loadHistory();
    } catch (err) {
      setParentError(err.message);
    } finally {
      setBusy("");
    }
  }

  const dailyCap = policy?.max_lamports_per_day != null ? Number(policy.max_lamports_per_day) : null;
  const perTxCap = policy?.max_lamports_per_tx != null ? Number(policy.max_lamports_per_tx) : null;
  const dailySpent = dailySpendLamports != null ? Number(dailySpendLamports) : null;
  const dailyPctRaw = dailyCap && dailyCap > 0 && dailySpent != null ? (dailySpent / dailyCap) * 100 : null;
  const dailyPct = dailyPctRaw != null ? Math.min(100, Math.max(0, dailyPctRaw)) : null;

  return (
    <div className="mb-3 border-t border-zinc-800/50 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Privy transaction loop</p>
        {isPaused ? (
          <span className="border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-amber-300">
            Paused
          </span>
        ) : (
          <span className="border border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300">
            Active
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
        On devnet, request SOL and send a real Solana Memo transaction through Privy before wiring posts or intents.
        {isPaused && pausedReason ? <span className="block text-amber-300"> Paused reason: {pausedReason}</span> : null}
      </p>
      <div className="mt-3 space-y-1 border border-zinc-800 bg-[#050505] p-3">
        <StatusRow label="wallet" value={walletAddress} href={addressExplorerUrl(walletAddress)} />
        <StatusRow label="balance" value={balanceSol != null ? `${Number(balanceSol).toFixed(4)} SOL` : null} />
        {perTxCap != null && (
          <StatusRow label="per-tx cap" value={formatSol(perTxCap)} />
        )}
        {dailyCap != null && (
          <StatusRow
            label="24h spent / cap"
            value={`${formatSol(dailySpent || 0)} / ${formatSol(dailyCap)}${dailyPct != null ? ` (${dailyPct.toFixed(1)}%)` : ""}`}
          />
        )}
      </div>
      {dailyPct != null && (
        <div className="mt-2 h-1 w-full bg-zinc-900">
          <div
            className={`h-1 ${dailyPct >= 100 ? "bg-amber-400" : dailyPct >= 75 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${dailyPct}%` }}
          />
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => call("/integrations/privy_wallet/devnet-airdrop", { sol: 1 })}
          disabled={Boolean(busy)}
          className="border border-sky-500/50 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-sky-200 transition-colors hover:bg-sky-500/10 disabled:opacity-50"
        >
          {busy === "/integrations/privy_wallet/devnet-airdrop" ? "Requesting..." : "Request devnet SOL"}
        </button>
        <button
          type="button"
          onClick={() => call("/integrations/privy_wallet/devnet-memo-test", { message: "Clickr Privy memo test" })}
          disabled={Boolean(busy) || isPaused}
          title={isPaused ? "Wallet is paused — resume it to send transactions" : ""}
          className="border border-[#E53935]/60 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#ffb5b3] transition-colors hover:bg-[#E53935]/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "/integrations/privy_wallet/devnet-memo-test" ? "Sending..." : "Send Memo test"}
        </button>
        {isPaused ? (
          <button
            type="button"
            onClick={() => call("/integrations/privy_wallet/resume", {})}
            disabled={Boolean(busy)}
            className="border border-emerald-500/60 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-200 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
          >
            {busy === "/integrations/privy_wallet/resume" ? "Resuming..." : "Resume wallet"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              const reason = window.prompt("Pause reason (optional)") || "";
              call("/integrations/privy_wallet/pause", { reason });
            }}
            disabled={Boolean(busy)}
            className="border border-amber-500/50 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-200 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
          >
            {busy === "/integrations/privy_wallet/pause" ? "Pausing..." : "Pause wallet"}
          </button>
        )}
        {agentId && (
          <a
            href={`/dashboard/agents/${agentId}/wallet`}
            className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            View all activity
          </a>
        )}
      </div>
      {result?.tx_hash && (
        <p className="mt-3 text-xs text-zinc-400">
          Submitted{" "}
          <a href={txExplorerUrl(result.tx_hash)} target="_blank" rel="noopener noreferrer" className="font-mono text-sky-200 hover:underline">
            {shortTxHash(result.tx_hash)}
          </a>
        </p>
      )}
      {history.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Latest transactions</p>
          <ul className="mt-2 space-y-2 text-xs text-zinc-500">
            {history.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-3">
                <span>
                  {tx.tx_type || "transaction"} · <span className={tx.status === "blocked" ? "text-amber-300" : tx.status === "failed" ? "text-[#ff9e9c]" : ""}>{tx.status}</span>
                </span>
                {tx.tx_hash ? (
                  <a href={txExplorerUrl(tx.tx_hash)} target="_blank" rel="noopener noreferrer" className="font-mono text-zinc-400 hover:text-sky-200">
                    {shortTxHash(tx.tx_hash)}
                  </a>
                ) : (
                  <span className="font-mono text-zinc-700">{tx.id}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PhantomActions({ walletAddress, authHeaders, onRefresh, setParentError }) {
  const [busy, setBusy] = useState("");
  const [txHash, setTxHash] = useState("");

  function getPhantomProvider() {
    if (typeof window === "undefined") return null;
    const p = window?.phantom?.solana || window?.solana || null;
    return p?.isPhantom ? p : null;
  }

  function solanaRpcEndpoint() {
    const custom = String(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "").trim();
    if (custom) return custom;
    const cluster = String(process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "mainnet-beta").toLowerCase();
    return cluster === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com";
  }

  function openInPhantom() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    // Phantom injects the provider in its in-app browser; iOS Safari commonly won't have it.
    const deeplink = `https://phantom.app/ul/browse/${encodeURIComponent(url)}`;
    window.location.assign(deeplink);
  }

  async function sendMemoTest() {
    setBusy("memo");
    setTxHash("");
    setParentError("");
    try {
      const provider = getPhantomProvider();
      if (!provider) {
        openInPhantom();
        throw new Error("Phantom provider not available here. Opening Phantom…");
      }
      const pubkey = provider?.publicKey;
      if (!pubkey) throw new Error("Connect Phantom first.");

      const rpc = solanaRpcEndpoint();
      const conn = new Connection(rpc, "confirmed");

      const feePayer = new PublicKey(walletAddress || pubkey.toString());
      const { blockhash } = await conn.getLatestBlockhash("confirmed");
      const memo = `clickr:test:${Date.now().toString(16)}`;
      const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

      const tx = new Transaction({ feePayer, recentBlockhash: blockhash }).add(
        new TransactionInstruction({
          keys: [],
          programId: MEMO_PROGRAM_ID,
          data: Buffer.from(memo, "utf8"),
        })
      );

      const result = await provider.signAndSendTransaction(tx);
      const signature = result?.signature || result?.hash || result;
      if (!signature) throw new Error("Phantom did not return a transaction signature.");
      setTxHash(String(signature));

      // Best-effort: record tx hash server-side (endpoint added in a later step).
      try {
        await fetch(`${API_URL}/integrations/phantom_wallet/record-transaction`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ tx_hash: String(signature), tx_type: "memo_test", metadata: { memo } }),
        });
      } catch {
        /* best-effort */
      }

      onRefresh?.();
    } catch (err) {
      setParentError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mb-3 border-t border-zinc-800/50 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Phantom approvals</p>
        <span className="border border-zinc-700 bg-[#050505] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-300">
          User-approved
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
        Phantom is user-owned. Each transaction requires your approval in the wallet.
      </p>
      <div className="mt-3 space-y-1 border border-zinc-800 bg-[#050505] p-3">
        <StatusRow label="wallet" value={walletAddress} href={addressExplorerUrl(walletAddress)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={sendMemoTest}
          disabled={Boolean(busy)}
          className="border border-[#E53935]/60 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#ffb5b3] transition-colors hover:bg-[#E53935]/10 disabled:opacity-50"
        >
          {busy === "memo" ? "Sending..." : "Send Memo test"}
        </button>
      </div>
      {txHash && (
        <p className="mt-3 text-xs text-zinc-400">
          Submitted{" "}
          <a href={txExplorerUrl(txHash)} target="_blank" rel="noopener noreferrer" className="font-mono text-sky-200 hover:underline">
            {shortTxHash(txHash)}
          </a>
        </p>
      )}
    </div>
  );
}

function MetaplexIdentityActions({ agentId, agentMeta, authHeaders, onRefresh, setParentError }) {
  const [busy, setBusy] = useState("");
  const [quote, setQuote] = useState(null);
  const [feeSig, setFeeSig] = useState("");

  const phantomCfg = agentMeta?.phantom_wallet || null;
  const phantomAddress = phantomCfg?.wallet_address || "";

  function getPhantomProvider() {
    if (typeof window === "undefined") return null;
    const p = window?.phantom?.solana || window?.solana || null;
    return p?.isPhantom ? p : null;
  }

  function openInPhantom() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const deeplink = `https://phantom.app/ul/browse/${encodeURIComponent(url)}`;
    window.location.assign(deeplink);
  }

  function solanaRpcEndpoint() {
    const custom = String(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "").trim();
    if (custom) return custom;
    const cluster = String(process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "mainnet-beta").toLowerCase();
    return cluster === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com";
  }

  async function loadQuote() {
    setBusy("quote");
    setParentError("");
    try {
      const res = await fetch(`${API_URL}/integrations/metaplex_identity/quote?agent_id=${encodeURIComponent(agentId)}`, {
        headers: { "Content-Type": "application/json", ...authHeaders },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      setQuote(data);
      return data;
    } catch (e) {
      setQuote(null);
      setParentError(e.message);
      return null;
    } finally {
      setBusy("");
    }
  }

  async function mint() {
    setBusy("mint");
    setFeeSig("");
    setParentError("");
    try {
      const provider = getPhantomProvider();
      if (!provider) {
        openInPhantom();
        throw new Error("Phantom provider not available here. Opening Phantom…");
      }
      if (!phantomAddress) throw new Error("Link Phantom first (dashboard → Phantom integration).");

      let q = quote;
      if (!q) q = await loadQuote();
      if (!q) throw new Error("Could not load quote");
      const treasury = String(q.treasuryWallet || "").trim();
      const lamports = String(q.feeAmountLamports || "").trim();
      if (!treasury || !/^\d+$/.test(lamports)) throw new Error("Quote missing treasury/fee lamports.");

      const fromPubkey = new PublicKey(phantomAddress);
      const toPubkey = new PublicKey(treasury);

      const conn = new Connection(solanaRpcEndpoint(), "confirmed");
      const { blockhash } = await conn.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: fromPubkey, recentBlockhash: blockhash }).add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports: BigInt(lamports),
        })
      );

      const signed = await provider.signAndSendTransaction(tx);
      const signature = signed?.signature || signed?.hash || signed;
      if (!signature) throw new Error("Phantom did not return a transaction signature.");

      const sigStr = String(signature);
      setFeeSig(sigStr);

      const claimRes = await fetch(`${API_URL}/integrations/metaplex_identity/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          agent_id: agentId,
          owner_wallet: phantomAddress,
          fee_tx_signature: sigStr,
        }),
      });
      const claimData = await claimRes.json().catch(() => ({}));
      if (!claimRes.ok || claimData.ok === false) {
        throw new Error(claimData.error || claimRes.statusText || "Mint failed");
      }

      await onRefresh?.();
    } catch (e) {
      setParentError(e.message);
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    void loadQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  async function retryMintOnly() {
    if (!feeSig) return;
    setBusy("retry");
    setParentError("");
    try {
      const claimRes = await fetch(`${API_URL}/integrations/metaplex_identity/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          agent_id: agentId,
          owner_wallet: phantomAddress,
          fee_tx_signature: feeSig,
        }),
      });
      const claimData = await claimRes.json().catch(() => ({}));
      if (!claimRes.ok || claimData.ok === false) {
        throw new Error(claimData.error || claimRes.statusText || "Mint failed");
      }
      await onRefresh?.();
    } catch (e) {
      setParentError(e.message);
    } finally {
      setBusy("");
    }
  }

  const verified = agentMeta?.metaplex_identity?.verification_status === "verified";
  const status = agentMeta?.metaplex_identity?.status || "";

  return (
    <div className="mt-4 border-t border-zinc-800/50 pt-4">
      <p className="text-xs leading-relaxed text-zinc-400">
        Frontier hackathon flow: Phantom pays a tiny devnet SOL fee, Clickr verifies the tx server-side, then mints a{" "}
        <span className="text-zinc-200">Metaplex Core</span> asset for this agent.
      </p>

      {!phantomAddress ? (
        <p className="mt-3 text-xs text-amber-200/90">
          Link Phantom first (Phantom integration card above).
        </p>
      ) : null}

      <div className="mt-3 space-y-1 border border-zinc-800 bg-[#050505] p-3">
        <StatusRow label="network" value={quote?.network} />
        <StatusRow label="fee" value={quote ? `${quote.feeAmount} ${quote.feeAsset}` : null} />
        <StatusRow label="treasury" value={quote?.treasuryWallet} href={addressExplorerUrl(quote?.treasuryWallet)} />
        <StatusRow label="phantom" value={phantomAddress || null} href={addressExplorerUrl(phantomAddress)} />
        {!verified ? <StatusRow label="status" value={status || "not_minted"} /> : null}
        {verified ? <StatusRow label="asset id" value={agentMeta?.metaplex_identity?.asset_id} /> : null}
        {verified ? (
          <StatusRow label="mint tx" value={agentMeta?.metaplex_identity?.mint_tx_signature} href={txExplorerUrl(agentMeta?.metaplex_identity?.mint_tx_signature)} />
        ) : null}
        {feeSig ? (
          <StatusRow label="fee tx" value={feeSig} href={txExplorerUrl(feeSig)} />
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => loadQuote()}
          disabled={Boolean(busy)}
          className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:opacity-50"
        >
          {busy === "quote" ? "Loading..." : "Refresh quote"}
        </button>
        <button
          type="button"
          onClick={() => mint()}
          disabled={Boolean(busy) || verified || !phantomAddress}
          className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-50"
        >
          {busy === "mint" ? "Minting..." : verified ? "Minted" : "Mint Solana Agent Identity"}
        </button>
        {!verified && feeSig ? (
          <button
            type="button"
            onClick={() => retryMintOnly()}
            disabled={Boolean(busy)}
            className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-zinc-500 disabled:opacity-50"
          >
            {busy === "retry" ? "Retrying..." : "Retry mint (same fee tx)"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function IntegrationCard({ integration, agentId, agentMeta, authHeaders, onRefresh }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [formValues, setFormValues] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [phantomBusy, setPhantomBusy] = useState(false);
  const [moonpayBusy, setMoonpayBusy] = useState(false);
  const [moonpayWidgetParams, setMoonpayWidgetParams] = useState({ currencyCode: "", walletAddress: "" });
  const [fundingBusy, setFundingBusy] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);

  const currentStatus = agentMeta?.[integration.id];
  const privyStatus = agentMeta?.privy_wallet;
  const privyWalletAddress = privyStatus?.wallet_address || "";
  const privyBaseWalletAddress = privyStatus?.base_wallet_address || "";
  const isConnected = currentStatus?.connected === true;
  // For the Privy card we render policy + paused state inside PrivyDevnetActions,
  // so suppress those keys in the generic status rows to avoid duplication.
  const PRIVY_HIDDEN_KEYS = new Set([
    "policy",
    "policy_summary",
    "daily_spend_lamports",
    "is_paused",
    "paused_at",
    "paused_reason",
    "wallet_address",
    "base_wallet_address",
    "balance_sol",
  ]);
  const statusRows =
    isConnected && currentStatus && typeof currentStatus === "object"
      ? Object.entries(currentStatus).filter(([key, val]) => {
          if (key === "connected") return false;
          if (val == null || val === "") return false;
          if (integration.id === "privy_wallet" && PRIVY_HIDDEN_KEYS.has(key)) return false;
          return true;
        })
      : [];

  function updateField(key, val) {
    setFormValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handlePhantomConnect() {
    setPhantomBusy(true);
    setError("");
    try {
      const provider =
        typeof window !== "undefined"
          ? (window?.phantom?.solana || window?.solana || null)
          : null;
      if (!provider?.isPhantom) {
        // On mobile, Phantom typically exposes the provider only in its in-app browser.
        const url = typeof window !== "undefined" ? window.location.href : "";
        if (url) {
          const deeplink = `https://phantom.app/ul/browse/${encodeURIComponent(url)}`;
          window.location.assign(deeplink);
          throw new Error("Opening Phantom…");
        }
        throw new Error("Phantom not detected.");
      }

      const connectRes = await provider.connect();
      const pubkey =
        connectRes?.publicKey?.toString?.() ||
        provider?.publicKey?.toString?.() ||
        "";
      if (!pubkey) throw new Error("Phantom did not return a public key.");

      const nonceRes = await fetch(`${API_URL}/integrations/phantom_wallet/nonce`, {
        method: "GET",
        headers: { "Content-Type": "application/json", ...authHeaders },
        cache: "no-store",
      });
      const nonceData = await nonceRes.json().catch(() => ({}));
      if (!nonceRes.ok) throw new Error(nonceData.error || nonceRes.statusText);

      const message = String(nonceData?.message || "");
      const nonce = String(nonceData?.nonce || "");
      const userId = nonceData?.user_id != null ? String(nonceData.user_id) : "";
      if (!message || !nonce) throw new Error("Nonce response missing message/nonce.");

      const encoder = new TextEncoder();
      const signed = await provider.signMessage(encoder.encode(message), "utf8");
      const sigBytes = signed?.signature || signed;
      if (!sigBytes) throw new Error("Phantom did not return a signature.");

      const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

      const res = await fetch(`${API_URL}/integrations/phantom_wallet/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          wallet_address: pubkey,
          label: formValues.label || undefined,
          nonce,
          message,
          signature: signatureBase64,
          user_id: userId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);

      setShowForm(false);
      setFormValues({});
      onRefresh?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setPhantomBusy(false);
    }
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

  async function handleWorldIdProof(result) {
    setConnecting(true);
    setError("");
    try {
      const proof = result?.proof ?? null;
      const merkle_root = result?.merkle_root ?? result?.merkleRoot ?? null;
      const nullifier_hash = result?.nullifier_hash ?? result?.nullifierHash ?? null;
      const verification_level = result?.verification_level ?? result?.verificationLevel ?? "device";

      const res = await fetch(`${API_URL}/integrations/world_id/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ proof, merkle_root, nullifier_hash, verification_level }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      onRefresh?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
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

      {integration.id === "metaplex_identity" && (
        <MetaplexIdentityActions
          agentId={agentId}
          agentMeta={agentMeta}
          authHeaders={authHeaders}
          onRefresh={onRefresh}
          setParentError={setError}
        />
      )}

      {statusRows.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-zinc-800/50 pt-4">
          {statusRows.map(([key, val]) => (
            <StatusRow
              key={key}
              label={key.replace(/_/g, " ")}
              value={typeof val === "object" ? JSON.stringify(val) : val}
              href={key === "wallet_address" ? addressExplorerUrl(String(val)) : null}
            />
          ))}
        </div>
      )}

      <div className="mt-4">
        {isConnected && integration.id === "privy_wallet" && (
          <>
            <PrivyDevnetActions
              agentId={agentId}
              walletAddress={privyWalletAddress}
              balanceSol={privyStatus?.balance_sol}
              isPaused={Boolean(privyStatus?.is_paused)}
              pausedReason={privyStatus?.paused_reason}
              policy={privyStatus?.policy}
              dailySpendLamports={privyStatus?.daily_spend_lamports}
              authHeaders={authHeaders}
              onRefresh={onRefresh}
              setParentError={setError}
            />
            <div className="mb-3 border-t border-zinc-800/50 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Mainnet funding</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                For production swaps, buy SOL with MoonPay or send SOL manually to this wallet.
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
              {privyBaseWalletAddress && (
                <div className="mt-3 border border-zinc-800 bg-[#050505] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Base wallet (for identity + x402)</p>
                  <code className="mt-2 block break-all text-[11px] text-zinc-300">{privyBaseWalletAddress}</code>
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
          </>
        )}

        {isConnected && integration.id === "phantom_wallet" && (
          <PhantomActions
            walletAddress={currentStatus?.wallet_address}
            authHeaders={authHeaders}
            onRefresh={onRefresh}
            setParentError={setError}
          />
        )}

        {integration.id === "world_id" && (
          <div className="mt-4 border-t border-zinc-800/50 pt-4">
            <p className="text-xs text-zinc-400">
              World ID adds trust by proving this agent is backed by a unique human. No KYC.
            </p>
            {isConnected ? (
              <p className="mt-2 text-xs text-emerald-300">Verified.</p>
            ) : !WORLD_APP_ID ? (
              <p className="mt-2 text-xs text-amber-200/90">
                World ID isn’t configured here. Set <code className="text-amber-100">NEXT_PUBLIC_WORLD_APP_ID</code> to enable the widget.
              </p>
            ) : (
              <IDKitWidget
                app_id={WORLD_APP_ID}
                action={WORLD_ACTION_ID}
                onSuccess={handleWorldIdProof}
                verification_level="device"
              >
                {({ open }) => (
                  <button
                    type="button"
                    onClick={open}
                    disabled={Boolean(connecting)}
                    className="mt-3 border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-50"
                  >
                    {connecting ? "Verifying..." : "Add human-backed verification"}
                  </button>
                )}
              </IDKitWidget>
            )}
          </div>
        )}

        {!isConnected && integration.id === "phantom_wallet" && (
          <div className="mt-4 border-t border-zinc-800/50 pt-4">
            <p className="text-xs text-zinc-400">
              Connect Phantom to link a user-owned Solana wallet. You&apos;ll approve a signature prompt to prove ownership.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block flex-1">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                  Label (optional)
                </span>
                <input
                  value={formValues.label || ""}
                  onChange={(e) => updateField("label", e.target.value)}
                  placeholder="e.g. trading"
                  className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={handlePhantomConnect}
                disabled={phantomBusy}
                className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-50"
              >
                {phantomBusy ? "Connecting..." : "Connect Phantom"}
              </button>
            </div>
          </div>
        )}

        {isConnected && integration.id === "moonpay" && (
          <div className="mb-3 border-t border-zinc-800/50 pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Currency (required)</span>
                <input
                  value={moonpayWidgetParams.currencyCode}
                  onChange={(e) => setMoonpayWidgetParams((p) => ({ ...p, currencyCode: e.target.value }))}
                  placeholder={currentStatus?.default_currency_code || "e.g. sol, eth, usdc"}
                  className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Wallet (optional)</span>
                <input
                  value={moonpayWidgetParams.walletAddress}
                  onChange={(e) => setMoonpayWidgetParams((p) => ({ ...p, walletAddress: e.target.value }))}
                  placeholder={currentStatus?.default_wallet_address || "Address to receive crypto"}
                  className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={handleMoonpayOpen}
              disabled={moonpayBusy}
              className="mt-3 border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-300 transition-colors hover:border-[#E53935]/50 hover:text-white disabled:opacity-50"
            >
              {moonpayBusy ? "Opening..." : "Open MoonPay"}
            </button>
          </div>
        )}

        {!isConnected && !showForm && integration.id !== "metaplex_identity" && (
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
              <label key={field.key} className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{field.label}</span>
                <input
                  value={formValues[field.key] || ""}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  required={field.required === true}
                  className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
                />
              </label>
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
      {error && !showForm && <p className="mt-3 text-xs text-[#ff9e9c]">{error}</p>}
    </div>
  );
}

function VerifyButton({ authHeaders, onRefresh }) {
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
