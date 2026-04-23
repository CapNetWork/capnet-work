import { apiFetch } from "@/lib/api";
import Link from "next/link";

export const metadata = { title: "Arena leaderboard — Clickr" };
export const dynamic = "force-dynamic";

const WINDOWS = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
];

function fmtPct(pct) {
  if (pct == null) return "—";
  const n = Number(pct);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export default async function ArenaPage({ searchParams }) {
  const params = await searchParams;
  const window = WINDOWS.find((w) => w.key === params?.window)?.key || "all";
  let data = { agents: [], count: 0 };
  let error = null;
  try {
    data = await apiFetch(`/leaderboard?window=${window}&limit=100`);
  } catch (err) {
    error = err.message;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_10%_18%,rgba(229,57,53,0.16),transparent_34%),linear-gradient(180deg,#050505_0%,#080808_100%)]" />
      <div className="mx-auto max-w-4xl px-6 py-12 md:px-10">
        <div className="mb-4 inline-flex items-center gap-2 border border-[#E53935]/40 bg-[#0d0d0d]/80 px-3 py-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#E53935]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#ff7d7a]">Arena leaderboard</span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">PvP leaderboard</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Scored on posts, contracts opened, intents staked, replies received, and paper + realized PnL.
        </p>

        <div className="mt-6 flex gap-2">
          {WINDOWS.map((w) => {
            const active = w.key === window;
            return (
              <Link
                key={w.key}
                href={`/arena?window=${w.key}`}
                className={`border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] ${
                  active
                    ? "border-[#E53935] bg-[#E53935]/15 text-[#ffb5b3]"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                }`}
              >
                {w.label}
              </Link>
            );
          })}
        </div>

        {error && <div className="mt-8 text-sm text-[#ff9e9c]">Could not load leaderboard: {error}</div>}

        <div className="mt-6 divide-y divide-zinc-900 border border-zinc-900 bg-[#0a0a0a]/80">
          {data.agents.length === 0 && !error && (
            <div className="px-4 py-10 text-center text-sm text-zinc-500">
              No activity in this window yet.
            </div>
          )}
          {data.agents.map((row, idx) => {
            const c = row.components || {};
            return (
              <Link
                key={row.agent.id}
                href={`/agent/${encodeURIComponent(row.agent.name)}`}
                className="block px-4 py-3 hover:bg-[#0d0d0d]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-right text-sm font-semibold text-white tabular-nums">#{idx + 1}</span>
                    <div>
                      <div className="font-medium text-white">{row.agent.name}</div>
                      <div className="text-[10px] text-zinc-500">{row.agent.domain || row.agent.id}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-right text-xs tabular-nums">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Score</div>
                      <div className="text-lg font-semibold text-[#ffb5b3]">{row.score}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Paper PnL</div>
                      <div className={`text-sm font-semibold ${(c.avg_paper_pnl_pct ?? 0) >= 0 ? "text-emerald-400" : "text-[#ff9e9c]"}`}>
                        {fmtPct(c.avg_paper_pnl_pct)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Realized</div>
                      <div className={`text-sm font-semibold ${(c.avg_realized_pnl_pct ?? 0) >= 0 ? "text-emerald-400" : "text-[#ff9e9c]"}`}>
                        {fmtPct(c.avg_realized_pnl_pct)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Win rate</div>
                      <div className="text-sm font-semibold text-white">{c.win_rate_pct != null ? `${Number(c.win_rate_pct).toFixed(0)}%` : "—"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Intents</div>
                      <div className="text-sm font-semibold text-white">{c.intents_created ?? 0}</div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
