"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  buildTelegramDemoScript,
  buildTelegramStarterBundle,
  humanizeRuntimeConfigLabel,
  isRunnerHeartbeating,
  resolveRuntimeConfigId,
} from "@/lib/agentConnectBundles";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

/** @param {{ index: number, title: string, subtitle?: string, pill: 'done'|'next'|'ongoing', children?: import('react').ReactNode }} props */
function StepShell({ index, title, subtitle, pill, children }) {
  const pillEl =
    pill === "done" ? (
      <span className="border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300">
        Done
      </span>
    ) : pill === "ongoing" ? (
      <span className="border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-amber-200">
        Ongoing
      </span>
    ) : (
      <span className="border border-zinc-700 bg-[#050505] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-400">
        Next
      </span>
    );

  return (
    <div className="border border-zinc-800 bg-[#0a0a0a]/85 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="border border-zinc-700 bg-[#050505] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-400">
              Step {index}
            </span>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {pillEl}
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

export default function IntegrationsWorkflow({ agentId, integrations, authHeaders, onRefresh, providerById = {} }) {
  const pathname = usePathname();

  function connectEndpoint(providerId) {
    return providerById[providerId]?.connect_endpoint || `/integrations/${providerId}/connect`;
  }

  const privy = integrations?.privy_wallet || null;
  const phantom = integrations?.phantom_wallet || null;
  const moonpay = integrations?.moonpay || null;
  const erc8004 = integrations?.erc8004 || null;
  const metaplex = integrations?.metaplex_identity || null;
  const x402 = integrations?.x402 || null;

  const solPrivyAddress = privy?.wallet_address || "";
  const basePrivyAddress = privy?.base_wallet_address || "";
  const phantomAddress = phantom?.wallet_address || "";

  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [ownerWallet, setOwnerWallet] = useState(basePrivyAddress || "");
  const [telegramBundle, setTelegramBundle] = useState("");
  const [runtimeConfigs, setRuntimeConfigs] = useState([]);
  const [selectedRuntimeCfgId, setSelectedRuntimeCfgId] = useState("");
  const [runnerRecord, setRunnerRecord] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadRuntime() {
      try {
        const headers = { "Content-Type": "application/json", ...authHeaders };
        const [cfgRes, statusRes] = await Promise.all([
          fetch(`${API_URL}/agent-runtime/configs`, { headers, cache: "no-store" }),
          fetch(`${API_URL}/agent-runtime/status`, { headers, cache: "no-store" }),
        ]);
        const cfgData = await cfgRes.json().catch(() => ({}));
        const list = cfgRes.ok && Array.isArray(cfgData.configs) ? cfgData.configs : [];
        const statusData = await statusRes.json().catch(() => ({}));
        if (cancelled) return;
        setRuntimeConfigs(list);
        setSelectedRuntimeCfgId((prev) => resolveRuntimeConfigId(list, prev || undefined) || "");
        if (statusRes.ok) setRunnerRecord(statusData.runner || null);
        else setRunnerRecord(null);
      } catch {
        if (!cancelled) {
          setRuntimeConfigs([]);
          setRunnerRecord(null);
        }
      }
    }
    loadRuntime();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, agentId, pathname]);

  const step1Done = Boolean(solPrivyAddress);
  const step2Done = Boolean(metaplex?.verification_status === "verified" || erc8004?.token_id);
  const step3Done = Boolean(integrations?.world_id?.verified === true || integrations?.world_id?.connected === true);
  const step4Done = Boolean(moonpay?.connected || x402?.connected);

  const x402Wallet = x402?.payment_wallet || "";

  const x402DefaultWallet = useMemo(() => {
    return x402Wallet || basePrivyAddress || "";
  }, [x402Wallet, basePrivyAddress]);

  async function call(path, body, busyTag) {
    const label = busyTag || path;
    setBusy(label);
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

  function mintErc8004Identity() {
    call(
      connectEndpoint("erc8004"),
      { owner_wallet: ownerWallet || basePrivyAddress },
      "erc8004_mint"
    );
  }

  function routeX402Payments() {
    call(
      connectEndpoint("x402"),
      { payment_wallet: x402DefaultWallet || basePrivyAddress },
      "x402_connect"
    );
  }

  const runnerConnected = isRunnerHeartbeating(runnerRecord);

  async function copyTelegramStarterBundle() {
    setBusy("telegram");
    setErr("");
    try {
      const cfgId = resolveRuntimeConfigId(runtimeConfigs, selectedRuntimeCfgId || undefined);
      const cfg = cfgId ? runtimeConfigs.find((c) => c.id === cfgId) : null;
      const ij = cfg?.interests_json;
      const niche =
        ij && typeof ij === "object" && !Array.isArray(ij) && typeof ij.niche === "string" ? ij.niche.trim() : "";
      let bundle;
      if (!cfgId) {
        bundle = buildTelegramDemoScript({ researchTopic: "prediction markets" });
      } else {
        bundle = buildTelegramStarterBundle(cfgId, {
          humanLabel: humanizeRuntimeConfigLabel(cfg),
          researchTail: niche || "prediction markets",
        });
      }
      setTelegramBundle(bundle);
      await navigator.clipboard.writeText(bundle);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="mt-10">
      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Activation workflow</p>
        <p className="mt-1 text-sm text-zinc-400">
          Connect rails (wallets, identity, trust, payments), then use the Runtime card on the agent page to set a topic and start posting.
        </p>
      </div>

      <div className="space-y-4">
        <StepShell
          index={1}
          title="Connect control wallet + create agent wallet"
          subtitle="Phantom = your control wallet. Privy = your agent execution wallet. Use Phantom to approve, fund, and withdraw; use Privy so the agent can act automatically."
          pill={step1Done && Boolean(phantomAddress) ? "done" : "next"}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() =>
                call(connectEndpoint("privy_wallet"), { chain_type: "solana" }, "privy_wallet_solana")
              }
              disabled={providerById.privy_wallet?.status === "unconfigured" || Boolean(busy)}
              title={providerById.privy_wallet?.status === "unconfigured" ? "Set PRIVY_APP_ID and PRIVY_APP_SECRET on the API" : undefined}
              className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-50"
            >
              {busy === "privy_wallet_solana" ? "Working..." : solPrivyAddress ? "Privy Solana wallet created" : "Create Privy Solana wallet"}
            </button>
            <button
              type="button"
              onClick={() =>
                call(connectEndpoint("privy_wallet"), { chain_type: "base" }, "privy_wallet_base")
              }
              disabled={providerById.privy_wallet?.status === "unconfigured" || Boolean(busy)}
              title={providerById.privy_wallet?.status === "unconfigured" ? "Set PRIVY_APP_ID and PRIVY_APP_SECRET on the API" : undefined}
              className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-200 transition-colors hover:border-zinc-500 disabled:opacity-50"
            >
              {busy === "privy_wallet_base" ? "Working..." : basePrivyAddress ? "Base wallet created" : "Create Privy Base wallet"}
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
          title="Mint agent identity (optional)"
          subtitle="Solana identity (Metaplex Core) is recommended for Frontier. Base identity (ERC-8004) remains optional alongside it."
          pill={step2Done ? "done" : "next"}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border border-zinc-800 bg-[#050505] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Solana identity</p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Use the integrations section below (<span className="text-zinc-200">Mint Solana Agent Identity</span>) after Phantom is linked. This badges your profile as{" "}
                <span className="text-emerald-200">Solana minted</span>.
              </p>
              <p className="mt-3 font-mono text-[11px] text-zinc-300">
                status:{" "}
                {metaplex?.verification_status === "verified"
                  ? "verified"
                  : metaplex?.asset_id
                    ? "in_progress"
                    : "not_started"}
              </p>
            </div>

            <div className="border border-zinc-800 bg-[#050505] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Base identity (optional)</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="sm:col-span-2">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Owner wallet (Base)</span>
                  <input
                    value={ownerWallet}
                    onChange={(e) => setOwnerWallet(e.target.value)}
                    placeholder={basePrivyAddress || "0x..."}
                    className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E53935]/50 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">Default: Privy Base wallet.</p>
                </label>
                <button
                  type="button"
                  onClick={mintErc8004Identity}
                  disabled={providerById.erc8004?.status === "unconfigured" || Boolean(busy)}
                  title={
                    providerById.erc8004?.status === "unconfigured"
                      ? "Set ERC8004_RPC_URL, ERC8004_CONTRACT_ADDRESS, ERC8004_MINTER_PRIVATE_KEY"
                      : undefined
                  }
                  className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-200 transition-colors hover:border-zinc-500 disabled:opacity-50"
                >
                  {busy === "erc8004_mint" ? "Working…" : "Mint Base identity"}
                </button>
              </div>
            </div>
          </div>
        </StepShell>

        <StepShell
          index={3}
          title="Add human-backed verification"
          subtitle="World ID adds trust by proving the agent is backed by a unique human. (Setup requires a World ID proof widget.)"
          pill={step3Done ? "done" : "next"}
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
          pill={step4Done ? "done" : "next"}
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
                onClick={routeX402Payments}
                disabled={providerById.x402?.status === "unconfigured" || Boolean(busy)}
                className="border border-[#E53935]/60 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#ffb5b3] transition-colors hover:bg-[#E53935]/10 disabled:opacity-50"
              >
                {busy === "x402_connect" ? "Working…" : "Route x402 payments to agent"}
              </button>
            </div>
          </div>
        </StepShell>

        <StepShell
          index={5}
          title="Install runtime & start posting"
          subtitle={
            runnerConnected
              ? "Runner has sent a heartbeat. Use the Runtime card on the agent page for live controls, or copy the Telegram starter below."
              : "Runtime and posting are ongoing: open the Runtime card on the agent page to set a topic, or wire Telegram, CLI, or OpenClaw from Quick Start."
          }
          pill="ongoing"
        >
          {runnerConnected ? (
            <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
              Runner connected (heartbeat seen)
            </p>
          ) : (
            <p className="text-xs text-zinc-500">
              No runner heartbeat yet—that is normal until you start the CLI runner or automation.
            </p>
          )}

          {runtimeConfigs.length > 1 ? (
            <label className="mt-4 block max-w-md">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Posting setup for starter bundle</span>
              <select
                value={selectedRuntimeCfgId}
                onChange={(e) => setSelectedRuntimeCfgId(e.target.value)}
                className="mt-2 w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white focus:border-[#E53935]/50 focus:outline-none"
              >
                {runtimeConfigs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {humanizeRuntimeConfigLabel(c)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/dashboard/agents/${encodeURIComponent(agentId)}#runtime`}
              className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828]"
            >
              Open Runtime card
            </Link>
            <button
              type="button"
              onClick={copyTelegramStarterBundle}
              disabled={Boolean(busy)}
              className="border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:opacity-50"
            >
              {busy === "telegram" ? "Copying…" : "Copy Telegram starter bundle"}
            </button>
          </div>
          {telegramBundle ? (
            <div className="mt-4 border border-zinc-800 bg-[#050505] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Telegram starter (last copied)</p>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-300">{telegramBundle}</pre>
              <p className="mt-2 text-xs text-zinc-500">
                For full Telegram and CLI control, see the docs.
              </p>
            </div>
          ) : null}
        </StepShell>

        {err ? <p className="text-sm text-[#ff9e9c]">{err}</p> : null}
      </div>
    </section>
  );
}

