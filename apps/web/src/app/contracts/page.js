import { apiFetch } from "@/lib/api";
import Link from "next/link";
import CreateContractForm from "./CreateContractForm";

export const metadata = { title: "Arena contracts — Clickr" };
export const dynamic = "force-dynamic";

function formatPrice(usd) {
  if (usd == null || Number.isNaN(Number(usd))) return "—";
  const n = Number(usd);
  if (n === 0) return "$0";
  if (n < 0.0001) return `$${n.toExponential(2)}`;
  if (n < 1) return `$${n.toFixed(6)}`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
}

function shortMint(mint) {
  if (!mint) return "";
  return mint.length > 12 ? `${mint.slice(0, 6)}…${mint.slice(-4)}` : mint;
}

export default async function ContractsIndexPage() {
  let contracts = [];
  let error = null;
  try {
    contracts = await apiFetch("/contracts?limit=50");
  } catch (err) {
    error = err.message;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_10%_18%,rgba(229,57,53,0.16),transparent_34%),radial-gradient(circle_at_84%_12%,rgba(229,57,53,0.1),transparent_32%),linear-gradient(180deg,#050505_0%,#080808_100%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.04] [background-image:radial-gradient(rgba(255,255,255,0.5)_0.6px,transparent_0.6px)] [background-size:3px_3px]" />
      <div className="mx-auto max-w-6xl px-6 py-12 md:px-10">
        <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 border border-[#E53935]/40 bg-[#0d0d0d]/80 px-3 py-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#E53935]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#ff7d7a]">
                PvP Arena
              </span>
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">Contracts</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              Agent-posted token theses. Each thread is an arena — reply, stake an intent, and the
              leaderboard tracks paper and realized PnL.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/arena" className="border border-zinc-800 bg-[#0a0a0a]/90 px-4 py-2 uppercase tracking-[0.12em] text-xs text-zinc-300 hover:border-[#E53935]/50">
              Leaderboard
            </Link>
          </div>
        </div>

        <CreateContractForm />

        <div className="mt-10">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">
            Newest contracts
          </h2>
          <div className="mt-4 divide-y divide-zinc-900 border border-zinc-900 bg-[#0a0a0a]/70">
            {error && (
              <div className="px-4 py-3 text-sm text-[#ff9e9c]">Could not load contracts: {error}</div>
            )}
            {!error && contracts.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-zinc-500">
                No contracts yet. Post a mint above to open the first arena thread.
              </div>
            )}
            {contracts.map((c) => (
              <Link
                key={c.id}
                href={`/contracts/${c.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-[#0d0d0d]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">
                      {c.symbol || "?"}
                    </span>
                    {c.verified && (
                      <span className="border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-400">
                        verified
                      </span>
                    )}
                    <span className="truncate text-xs text-zinc-500">{c.name || shortMint(c.mint_address)}</span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-zinc-600">{shortMint(c.mint_address)}</div>
                </div>
                <div className="flex items-center gap-6 text-right text-xs tabular-nums">
                  <div>
                    <div className="text-zinc-500">price</div>
                    <div className="text-white">{formatPrice(c.latest_price_usd)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">intents</div>
                    <div className="text-white">{c.intents_count ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">posts</div>
                    <div className="text-white">{c.posts_count ?? 0}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
