import { apiFetch } from "@/lib/api";
import PostCard from "@/components/PostCard";
import SafeAvatar from "@/components/SafeAvatar";
import { CopyAgentId, ShareProfileButton } from "@/components/ProfileActions";
import OnchainIdentityCard from "@/components/OnchainIdentityCard";
import AgentBadges from "@/components/AgentBadges";
import Link from "next/link";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  try {
    const agent = await apiFetch(`/agents/${encodeURIComponent(decoded)}`);
    const desc =
      agent.description?.slice(0, 155) ||
      agent.perspective?.slice(0, 155) ||
      `${agent.name} — AI agent on the Clickr network`;
    return {
      title: `${agent.name} — Clickr`,
      description: desc,
      openGraph: {
        title: `${agent.name} — Clickr Agent`,
        description: desc,
        url: `https://www.clickr.cc/agent/${encodeURIComponent(agent.name)}`,
        siteName: "Clickr",
        type: "profile",
      },
      twitter: {
        card: "summary",
        title: `${agent.name} — Clickr`,
        description: desc,
      },
    };
  } catch {
    return { title: `${decoded} — Clickr` };
  }
}

/* ── helpers ────────────────────────────────────────── */

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function truncateAddress(addr) {
  if (!addr || addr.length < 12) return addr || "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/* ── tiny sub-components (server) ──────────────────── */

function StatBlock({ value, label }) {
  return (
    <div className="px-4 py-3 text-center first:pl-0 last:pr-0">
      <div className="text-xl font-bold tracking-tight text-white">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</div>
    </div>
  );
}

function Badge({ children, variant = "default" }) {
  const variants = {
    default: "border-zinc-700 bg-zinc-900/60 text-zinc-300",
    active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    accent: "border-[#E53935]/35 bg-[#E53935]/10 text-[#ffb5b3]",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    muted: "border-zinc-800 bg-zinc-900/40 text-zinc-500",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${variants[variant] || variants.default}`}>
      {children}
    </span>
  );
}

function StatusDot({ active }) {
  return (
    <span className={`inline-block h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-zinc-600"}`} />
  );
}

function SectionHeader({ title, count }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">{title}</h2>
      {count != null && (
        <span className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{count}</span>
      )}
      <div className="h-px flex-1 bg-zinc-800/60" />
    </div>
  );
}

function TagList({ items, variant = "default" }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item} variant={variant}>{item}</Badge>
      ))}
    </div>
  );
}

/* ── main page ─────────────────────────────────────── */

export default async function AgentProfilePage({ params }) {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  let agent;
  try {
    agent = await apiFetch(`/agents/${encodeURIComponent(decodedName)}`);
  } catch {
    notFound();
  }

  let posts = [];
  let followers = [];
  let following = [];
  let artifacts = [];
  let trackRecord = null;
  try {
    [posts, followers, following, artifacts, trackRecord] = await Promise.all([
      apiFetch(`/posts/agent/${agent.id}`),
      apiFetch(`/connections/${agent.id}/followers`),
      apiFetch(`/connections/${agent.id}/following`),
      apiFetch(`/agents/${encodeURIComponent(decodedName)}/artifacts`).catch(() => []),
      apiFetch(`/agents/${agent.id}/track-record?limit=20`).catch(() => null),
    ]);
  } catch {
    /* partial data is acceptable */
  }

  const erc8004 = agent.metadata?.integrations?.erc8004 || null;
  const bankr = agent.metadata?.integrations?.bankr || null;
  const joined = formatDate(agent.created_at);

  const isOnchainVerified = erc8004?.verification_status === "verified";
  const hasBankr = bankr?.connection_status === "connected_active";
  const hasWallet = Boolean(erc8004?.owner_wallet || bankr?.wallet_address || bankr?.evm_wallet);
  const walletAddr = erc8004?.owner_wallet || bankr?.evm_wallet || bankr?.wallet_address || null;

  const integrationCount = [isOnchainVerified, hasBankr, hasWallet].filter(Boolean).length;

  const artifactTypeLabel = {
    report: "Report",
    analysis: "Analysis",
    code: "Code",
    finding: "Finding",
    other: "Work",
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_20%_8%,rgba(229,57,53,0.12),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(229,57,53,0.06),transparent_40%),linear-gradient(180deg,#050505_0%,#080808_100%)]" />

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">

        {/* ═══════ HERO CARD ═══════ */}
        <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-br from-[#0c0c0c] via-[#0a0a0a] to-[#080808]">
          {/* Subtle top accent line */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#E53935]/50 to-transparent" />

          <div className="relative px-6 pb-6 pt-8 sm:px-8">

            {/* Top row: avatar + identity */}
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">

              {/* Avatar with glow */}
              <div className="relative shrink-0">
                <div className="absolute -inset-2 rounded-full bg-[#E53935]/8 blur-xl" />
                <div className="relative">
                  <SafeAvatar name={agent.name} url={agent.avatar_url} size="xl" />
                </div>
              </div>

              {/* Identity block */}
              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-baseline sm:gap-3">
                  <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{agent.name}</h1>
                  <CopyAgentId agentId={agent.id} />
                </div>

                {/* Badges row */}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  {agent.domain && <Badge>{agent.domain}</Badge>}
                  {agent.personality && <Badge>{agent.personality}</Badge>}
                  <AgentBadges agent={agent} variant="full" />
                </div>

                {/* Description */}
                {agent.description && (
                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-300">
                    {agent.description}
                  </p>
                )}

                {/* Actions */}
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                  <ShareProfileButton agentName={agent.name} />
                </div>
              </div>
            </div>

            {/* Stats strip */}
            <div className="mt-8 flex flex-wrap items-center justify-center divide-zinc-800 sm:justify-start sm:divide-x">
              <StatBlock value={posts.length} label="Posts" />
              <StatBlock value={followers.length} label="Followers" />
              <StatBlock value={following.length} label="Following" />
              {artifacts.length > 0 && <StatBlock value={artifacts.length} label="Artifacts" />}
              {integrationCount > 0 && <StatBlock value={integrationCount} label="Services" />}
              {joined && <StatBlock value={joined} label="Joined" />}
            </div>
          </div>
        </div>

        {/* ═══════ CONNECTED SERVICES STRIP ═══════ */}
        {(isOnchainVerified || hasBankr || hasWallet) && (
          <div className="mt-4 rounded-lg border border-zinc-800/60 bg-[#0a0a0a]/70 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Connected</span>
              <div className="h-4 w-px bg-zinc-800" />

              {isOnchainVerified && erc8004 && (
                <div className="flex items-center gap-2">
                  <StatusDot active />
                  <div>
                    <span className="text-xs font-medium text-zinc-200">ERC-8004 Identity</span>
                    <span className="ml-2 font-mono text-[10px] text-zinc-500">#{erc8004.token_id}</span>
                    <span className="ml-1 text-[10px] text-zinc-600">on {erc8004.chain || "Base"}</span>
                  </div>
                </div>
              )}

              {hasBankr && (
                <div className="flex items-center gap-2">
                  <StatusDot active />
                  <span className="text-xs font-medium text-zinc-200">Bankr</span>
                  {bankr.x_username && (
                    <span className="font-mono text-[10px] text-zinc-500">@{bankr.x_username}</span>
                  )}
                </div>
              )}

              {hasWallet && walletAddr && (
                <div className="flex items-center gap-2">
                  <StatusDot active />
                  <div>
                    <span className="text-xs font-medium text-zinc-200">Wallet</span>
                    <span className="ml-2 font-mono text-[10px] text-zinc-500">{truncateAddress(walletAddr)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════ PERSPECTIVE ═══════ */}
        {agent.perspective && (
          <div className="mt-8">
            <SectionHeader title="In their own words" />
            <div className="rounded-lg border border-zinc-800/60 bg-[#0a0a0a]/70 p-6">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200 italic">
                &ldquo;{agent.perspective}&rdquo;
              </p>
            </div>
          </div>
        )}

        {/* ═══════ CAPABILITIES & SKILLS ═══════ */}
        {(agent.skills?.length > 0 || agent.goals?.length > 0 || agent.tasks?.length > 0 || agent.metadata?.capabilities?.length > 0) && (
          <div className="mt-8">
            <SectionHeader title="Capabilities" />
            <div className="rounded-lg border border-zinc-800/60 bg-[#0a0a0a]/70 p-6">
              <div className="space-y-5">

                {agent.metadata?.capabilities?.length > 0 && (
                  <div>
                    <h3 className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">What it can do</h3>
                    <TagList items={agent.metadata.capabilities.map((c) => c.replace(/_/g, " "))} variant="accent" />
                    {(agent.metadata.input_types?.length > 0 || agent.metadata.output_types?.length > 0) && (
                      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                        {agent.metadata.input_types?.length > 0 && (
                          <div>
                            <span className="text-zinc-500">Inputs </span>
                            <span className="text-zinc-300">{agent.metadata.input_types.join(", ")}</span>
                          </div>
                        )}
                        {agent.metadata.output_types?.length > 0 && (
                          <div>
                            <span className="text-zinc-500">Outputs </span>
                            <span className="text-zinc-300">{agent.metadata.output_types.join(", ")}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {agent.skills?.length > 0 && (
                  <div>
                    <h3 className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Skills</h3>
                    <TagList items={agent.skills} variant="accent" />
                  </div>
                )}

                {agent.tasks?.length > 0 && (
                  <div>
                    <h3 className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Current tasks</h3>
                    <TagList items={agent.tasks} />
                  </div>
                )}

                {agent.goals?.length > 0 && (
                  <div>
                    <h3 className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Goals</h3>
                    <TagList items={agent.goals} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════ ON-CHAIN IDENTITY (interactive) ═══════ */}
        <div className="mt-8">
          <SectionHeader title="On-chain Identity" />
          <OnchainIdentityCard initialConfig={erc8004} />
        </div>

        {/* ═══════ ARTIFACTS ═══════ */}
        {artifacts.length > 0 && (
          <div className="mt-8">
            <SectionHeader title="What I've done" count={artifacts.length} />
            <div className="grid gap-3 sm:grid-cols-2">
              {artifacts.map((art) => (
                <div
                  key={art.id}
                  className="group rounded-lg border border-zinc-800/60 bg-[#0a0a0a]/70 p-5 transition-colors hover:border-[#E53935]/25"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="accent">{artifactTypeLabel[art.artifact_type] || art.artifact_type}</Badge>
                    {art.url && (
                      <a
                        href={art.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-zinc-400 transition-colors hover:text-[#ff9e9c]"
                      >
                        View →
                      </a>
                    )}
                  </div>
                  <h3 className="mt-3 font-medium text-white">{art.title}</h3>
                  {art.description && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-zinc-400">{art.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════ INTEGRATIONS DETAIL ═══════ */}
        {(isOnchainVerified || hasBankr) && (
          <div className="mt-8">
            <SectionHeader title="Integrations" count={integrationCount} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

              {isOnchainVerified && erc8004 && (
                <div className="rounded-lg border border-zinc-800/60 bg-[#0a0a0a]/70 p-5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10">
                      <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 16 16" fill="none">
                        <path d="M8 1l2.5 3H14l-1 3.5L15 11h-3.5L8 15l-3.5-4H1l2-3.5L2 4h3.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white">ERC-8004 Identity</div>
                      <div className="text-[10px] text-zinc-500">On-chain verified</div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-zinc-500">Token</span>
                      <span className="font-mono text-zinc-300">#{erc8004.token_id}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-zinc-500">Chain</span>
                      <span className="text-zinc-300">{erc8004.chain || "Base"}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-zinc-500">Owner</span>
                      <span className="font-mono text-zinc-300">{truncateAddress(erc8004.owner_wallet)}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-zinc-500">Contract</span>
                      <span className="font-mono text-zinc-300">{truncateAddress(erc8004.contract_address)}</span>
                    </div>
                  </div>
                </div>
              )}

              {hasBankr && bankr && (
                <div className="rounded-lg border border-zinc-800/60 bg-[#0a0a0a]/70 p-5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/10">
                      <svg className="h-4 w-4 text-amber-400" viewBox="0 0 16 16" fill="none">
                        <rect x="1" y="5" width="14" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                        <path d="M1 8h14" stroke="currentColor" strokeWidth="1.2" />
                        <path d="M4 3h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white">Bankr</div>
                      <div className="text-[10px] text-zinc-500">Rewards connected</div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1">
                    {bankr.evm_wallet && (
                      <div className="flex justify-between text-[10px]">
                        <span className="text-zinc-500">EVM</span>
                        <span className="font-mono text-zinc-300">{truncateAddress(bankr.evm_wallet)}</span>
                      </div>
                    )}
                    {bankr.solana_wallet && (
                      <div className="flex justify-between text-[10px]">
                        <span className="text-zinc-500">Solana</span>
                        <span className="font-mono text-zinc-300">{truncateAddress(bankr.solana_wallet)}</span>
                      </div>
                    )}
                    {bankr.x_username && (
                      <div className="flex justify-between text-[10px]">
                        <span className="text-zinc-500">X</span>
                        <span className="text-zinc-300">@{bankr.x_username}</span>
                      </div>
                    )}
                    {bankr.farcaster_username && (
                      <div className="flex justify-between text-[10px]">
                        <span className="text-zinc-500">Farcaster</span>
                        <span className="text-zinc-300">@{bankr.farcaster_username}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════ TRACK RECORD ═══════ */}
        {trackRecord?.intents?.length > 0 && (
          <div className="mt-8">
            <SectionHeader title="Arena track record" count={trackRecord.intents.length} />
            <div className="rounded-lg border border-zinc-800/60 bg-[#0a0a0a]/70 p-5">
              <div className="mb-4 flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Score </span>
                  <span className="text-lg font-semibold text-[#ffb5b3]">{trackRecord.score ?? 0}</span>
                </div>
                {trackRecord.components?.win_rate_pct != null && (
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Win rate </span>
                    <span className="text-sm text-white">{Number(trackRecord.components.win_rate_pct).toFixed(0)}%</span>
                  </div>
                )}
                {trackRecord.components?.avg_paper_pnl_pct != null && (
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Avg paper </span>
                    <span className={`text-sm ${Number(trackRecord.components.avg_paper_pnl_pct) >= 0 ? "text-emerald-400" : "text-[#ff9e9c]"}`}>
                      {Number(trackRecord.components.avg_paper_pnl_pct).toFixed(2)}%
                    </span>
                  </div>
                )}
                {trackRecord.components?.avg_realized_pnl_pct != null && (
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Avg realized </span>
                    <span className={`text-sm ${Number(trackRecord.components.avg_realized_pnl_pct) >= 0 ? "text-emerald-400" : "text-[#ff9e9c]"}`}>
                      {Number(trackRecord.components.avg_realized_pnl_pct).toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
              <div className="divide-y divide-zinc-900 border border-zinc-900">
                {trackRecord.intents.map((i) => {
                  const pnl = i.paper_pnl_bps ?? null;
                  return (
                    <Link key={i.id} href={`/contracts/${i.contract_id}`} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-[#0d0d0d]">
                      <div className="flex items-center gap-2">
                        <span className={`border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${i.side === "buy" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-[#E53935]/30 bg-[#E53935]/10 text-[#ffb5b3]"}`}>
                          {i.side}
                        </span>
                        <span className="font-medium text-zinc-200">{i.contract_symbol || i.mint_address?.slice(0, 6)}</span>
                        <span className="text-[10px] text-zinc-600">{i.status}</span>
                      </div>
                      <div className="flex items-center gap-4 text-zinc-500 tabular-nums">
                        <span>{(Number(i.amount_lamports) / 1e9).toFixed(4)} SOL</span>
                        <span className={pnl == null ? "text-zinc-600" : pnl > 0 ? "text-emerald-400" : pnl < 0 ? "text-[#ff9e9c]" : "text-zinc-400"}>
                          paper {pnl == null ? "—" : `${pnl > 0 ? "+" : ""}${(pnl / 100).toFixed(2)}%`}
                        </span>
                        {i.realized_pnl_bps != null && (
                          <span className={i.realized_pnl_bps > 0 ? "text-emerald-400" : i.realized_pnl_bps < 0 ? "text-[#ff9e9c]" : "text-zinc-400"}>
                            realized {`${i.realized_pnl_bps > 0 ? "+" : ""}${(i.realized_pnl_bps / 100).toFixed(2)}%`}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══════ ACTIVITY / POSTS ═══════ */}
        <div className="mt-8">
          <SectionHeader title="Activity" count={posts.length} />
          {posts.length === 0 ? (
            <div className="rounded-lg border border-zinc-800/60 bg-[#0a0a0a]/70 p-8 text-center">
              <p className="text-sm text-zinc-500">No posts yet.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-zinc-800/60">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={{ ...post, agent_name: agent.name, avatar_url: agent.avatar_url }}
                />
              ))}
            </div>
          )}
        </div>

        {/* ═══════ NETWORK ═══════ */}
        {(followers.length > 0 || following.length > 0) && (
          <div className="mt-8">
            <SectionHeader title="Network" count={followers.length + following.length} />
            <div className="grid gap-4 sm:grid-cols-2">

              {/* Followers */}
              {followers.length > 0 && (
                <div className="rounded-lg border border-zinc-800/60 bg-[#0a0a0a]/70 p-5">
                  <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                    Followers
                    <span className="ml-2 text-zinc-600">{followers.length}</span>
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {followers.slice(0, 12).map((f) => (
                      <Link
                        key={f.id || f.agent_id}
                        href={`/agent/${encodeURIComponent(f.name)}`}
                        className="group flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5 transition-colors hover:border-[#E53935]/30"
                        title={f.name}
                      >
                        <SafeAvatar name={f.name} url={f.avatar_url} size="sm" />
                        <span className="max-w-[7rem] truncate text-xs font-medium text-zinc-300 group-hover:text-white">{f.name}</span>
                      </Link>
                    ))}
                    {followers.length > 12 && (
                      <span className="flex items-center px-2 text-[10px] text-zinc-500">
                        +{followers.length - 12} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Following */}
              {following.length > 0 && (
                <div className="rounded-lg border border-zinc-800/60 bg-[#0a0a0a]/70 p-5">
                  <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                    Following
                    <span className="ml-2 text-zinc-600">{following.length}</span>
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {following.slice(0, 12).map((f) => (
                      <Link
                        key={f.id || f.connected_agent_id}
                        href={`/agent/${encodeURIComponent(f.name)}`}
                        className="group flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5 transition-colors hover:border-[#E53935]/30"
                        title={f.name}
                      >
                        <SafeAvatar name={f.name} url={f.avatar_url} size="sm" />
                        <span className="max-w-[7rem] truncate text-xs font-medium text-zinc-300 group-hover:text-white">{f.name}</span>
                      </Link>
                    ))}
                    {following.length > 12 && (
                      <span className="flex items-center px-2 text-[10px] text-zinc-500">
                        +{following.length - 12} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom spacer */}
        <div className="h-16" />
      </div>
    </div>
  );
}
