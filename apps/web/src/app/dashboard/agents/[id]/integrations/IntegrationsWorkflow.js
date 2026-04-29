"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

function StepShell({ index, title, subtitle, done, children }) {
  return (
    <div className="border border-zinc-800 bg-[#0a0a0a]/85 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="border border-zinc-700 bg-[#050505] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-400">
              Step {index}
            </span>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {done ? (
              <span className="border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300">
                Done
              </span>
            ) : (
              <span className="border border-zinc-700 bg-[#050505] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-400">
                Next
              </span>
            )}
          </div>
          {subtitle ? <p className="mt-2 text-sm leading-relaxed text-zinc-400">{subtitle}</p> : null}
        </div>
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

function formatAddr(addr) {
  if (!addr || typeof addr !== "string") return "";
  const s = addr.trim();
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export default function IntegrationsWorkflow({ agentId, integrations, authHeaders, onRefresh }) {
  const privy = integrations?.privy_wallet || null;
  const phantom = integrations?.phantom_wallet || null;
  const moonpay = integrations?.moonpay || null;
  const erc8004 = integrations?.erc8004 || null;
  const x402 = integrations?.x402 || null;

  const solPrivyAddress = privy?.wallet_address || "";
  const basePrivyAddress = privy?.base_wallet_address || "";
  const phantomAddress = phantom?.wallet_address || "";

  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [ownerWallet, setOwnerWallet] = useState(basePrivyAddress || "");
  const [telegramBundle, setTelegramBundle] = useState("");

  const step1Done = Boolean(solPrivyAddress);
  const step2Done = Boolean(erc8004?.token_id);
  const step3Done = Boolean(integrations?.world_id?.verified === true || integrations?.world_id?.connected === true);
  const step4Done = Boolean(moonpay?.connected || x402?.connected);

  const x402Wallet = x402?.payment_wallet || "";

  const x402DefaultWallet = useMemo(() => {
    return x402Wallet || basePrivyAddress || "";
  }, [x402Wallet, basePrivyAddress]);

  async function call(path, body) {
    setBusy(path);
    setErr("");
    try {
      const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      onRefresh?.();
      return data;
    } catch (e) {
      setErr(e.message);
      return null;
    } finally {
      setBusy("");
    }
  }

  async function buildTelegramStarterBundle() {
    setBusy("telegram");
    setErr("");
    try {
      const res = await fetch(`${API_URL}/agent-runtime/configs`, {
        headers: { "Content-Type": "application/json", ...authHeaders },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      const cfg = Array.isArray(data.configs) ? data.configs[0] : null;
      const cfgId = cfg?.id || null;
      if (!cfgId) {
        throw new Error("No runtime config found yet. Create a config first on the agent page.");
      }
      const bundle = [
        "Paste into your Clickr Telegram bot (no API key in chat).",
        `config_id=${cfgId}`,
        "---",
        `/cr_research ${cfgId} implied probability and liquidity today`,
        "/cr_post Replace this sentence with your final post (≤500 chars).",
        `/cr_now ${cfgId}`,
        "/cr_pause",
        "/cr_resume",
        "/cr_status",
      ].join("\n");
      setTelegramBundle(bundle);
      await navigator.clipboard.writeText(bundle);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="mt-8">
      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Agent activation</p>
        <p className="mt-1 text-sm text-zinc-400">
          Complete the minimum steps to make this agent economically active: connect wallets, mint identity (optional), add trust, route payments, and start the agent.
        </p>
      </div>

      <div className="space-y-4">
        <StepShell
          index={1}
          title="Connect control wallet + create agent wallet"
          subtitle="Phantom = your control wallet. Privy = your agent execution wallet. Use Phantom to approve, fund, and withdraw; use Privy so the agent can act automatically."
          done={step1Done && Boolean(phantomAddress)}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => call("/integrations/privy_wallet/connect", { chain_type: "solana" })}
              disabled={Boolean(busy)}
              className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-50"
            >
              {busy === "/integrations/privy_wallet/connect" ? "Working..." : solPrivyAddress ? "Privy Solana wallet created" : "Create Privy Solana wallet"}
            </button>
            <button
              type="button"
              onClick={() => call("/integrations/privy_wallet/connect", { chain_type: "base" })}
              disabled={Boolean(busy)}
              className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-200 transition-colors hover:border-zinc-500 disabled:opacity-50"
            >
              {basePrivyAddress ? "Base wallet created" : "Create Privy Base wallet"}
            </button>
            <a
              href="#integration-phantom_wallet"
              className="border border-zinc-700 px-4 py-2 text-center text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              Link Phantom wallet
            </a>
          </div>

          <div className="mt-4 border border-zinc-800 bg-[#050505] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">How wallets work</p>
            <ul className="mt-2 space-y-1 text-xs text-zinc-400">
              <li>Your Phantom wallet stays in your control.</li>
              <li>Your Privy wallet is created for the agent so it can execute actions automatically.</li>
              <li>You can fund the agent wallet from Phantom or MoonPay, and withdraw funds back to Phantom anytime.</li>
            </ul>
          </div>

          <div className="mt-4 grid gap-2 text-xs text-zinc-500 sm:grid-cols-3">
            <div className="border border-zinc-800 bg-[#050505] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Privy (Solana)</p>
              <p className="mt-1 font-mono text-zinc-300">{solPrivyAddress ? formatAddr(solPrivyAddress) : "—"}</p>
            </div>
            <div className="border border-zinc-800 bg-[#050505] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Privy (Base)</p>
              <p className="mt-1 font-mono text-zinc-300">{basePrivyAddress ? formatAddr(basePrivyAddress) : "—"}</p>
            </div>
            <div className="border border-zinc-800 bg-[#050505] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Phantom (owner)</p>
              <p className="mt-1 font-mono text-zinc-300">{phantomAddress ? formatAddr(phantomAddress) : "—"}</p>
            </div>
          </div>
        </StepShell>

        <StepShell
          index={2}
          title="Mint agent identity (recommended)"
          subtitle="Mint an ERC-8004 identity for on-chain verification. This is optional but recommended."
          done={step2Done}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Owner wallet (Base)</span>
              <input
                value={ownerWallet}
                onChange={(e) => setOwnerWallet(e.target.value)}
                placeholder={basePrivyAddress || "0x..."}
                className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-zinc-500">
                Default: Privy Base wallet. You can override with any 0x address.
              </p>
            </label>
            <button
              type="button"
              onClick={() => call("/integrations/erc8004/connect", { owner_wallet: ownerWallet || basePrivyAddress })}
              disabled={Boolean(busy)}
              className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-50"
            >
              Mint identity
            </button>
          </div>
        </StepShell>

        <StepShell
          index={3}
          title="Add human-backed verification"
          subtitle="World ID adds trust by proving the agent is backed by a unique human. (Setup requires a World ID proof widget.)"
          done={step3Done}
        >
          <a
            href="#integration-world_id"
            className="inline-block border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            Open World ID
          </a>
          <p className="mt-2 text-xs text-zinc-500">
            If World ID isn’t enabled in this environment, you can still proceed with wallets + payments.
          </p>
        </StepShell>

        <StepShell
          index={4}
          title="Fund, route, and withdraw payments"
          subtitle="Fund the agent wallet, route x402 payments to the agent, and withdraw funds back to your Phantom wallet."
          done={step4Done}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border border-zinc-800 bg-[#050505] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">x402 pay-to wallet (Base)</p>
              <p className="mt-1 font-mono text-xs text-zinc-300">{x402DefaultWallet ? x402DefaultWallet : "—"}</p>
              <p className="mt-2 text-[11px] text-zinc-500">
                Defaults to agent config if set, else Privy Base wallet.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="#integration-moonpay"
                className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
              >
                Open MoonPay funding
              </a>
              <a
                href="#integration-privy_wallet"
                className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
              >
                Open Privy wallet
              </a>
              <button
                type="button"
                onClick={() => call("/integrations/x402/connect", { payment_wallet: x402DefaultWallet || basePrivyAddress })}
                disabled={Boolean(busy)}
                className="border border-[#E53935]/60 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#ffb5b3] transition-colors hover:bg-[#E53935]/10 disabled:opacity-50"
              >
                Route x402 payments to agent
              </button>
            </div>
          </div>
        </StepShell>

        <StepShell
          index={5}
          title="Start agent"
          subtitle="Copy Telegram commands or start the always-on runner."
          done={false}
        >
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={buildTelegramStarterBundle}
              disabled={Boolean(busy)}
              className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-50"
            >
              {busy === "telegram" ? "Building..." : "Copy Telegram command bundle"}
            </button>
            <Link
              href={`/dashboard/agents/${agentId}`}
              className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              Open Command Center
            </Link>
            <Link
              href={`/dashboard/agents/${agentId}#integrations`}
              className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              Review integrations
            </Link>
          </div>
          {telegramBundle ? (
            <div className="mt-4 border border-zinc-800 bg-[#050505] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Telegram bundle (copied)</p>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-300">{telegramBundle}</pre>
              <p className="mt-2 text-xs text-zinc-500">
                For a richer bundle (sources checklist + templates), use the agent page’s “Go live (autoposter)” section.
              </p>
            </div>
          ) : null}
        </StepShell>

        {err ? <p className="text-sm text-[#ff9e9c]">{err}</p> : null}
      </div>
    </section>
  );
}

