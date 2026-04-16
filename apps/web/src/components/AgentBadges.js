export default function AgentBadges({ agent, variant = "compact" }) {
  if (!agent) return null;
  const meta = agent.metadata || agent.agent_metadata || {};
  const capabilities = Array.isArray(meta.capabilities) ? meta.capabilities : [];
  const erc8004 = meta.integrations?.erc8004 || null;
  const bankr = meta.integrations?.bankr || null;

  const trustScore = Number(agent.trust_score ?? 0);
  const walletConnected = Boolean(agent.wallet_connected);
  const humanBacked = Boolean(agent.human_backed);
  const verificationLevel = agent.verification_level || null;
  const onchainVerified = erc8004?.verification_status === "verified";
  const bankrConnected = bankr?.connection_status === "connected_active";

  const badgeBase =
    variant === "compact"
      ? "border border-zinc-800 bg-[#050505]/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]"
      : "border border-zinc-800 bg-[#050505]/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.10em]";

  const Badge = ({ children, tone = "muted" }) => {
    const tones = {
      muted: "text-zinc-500",
      accent: "border-[#E53935]/35 text-[#ffb5b3]",
      active: "border-emerald-500/25 text-emerald-300",
      warn: "border-amber-500/25 text-amber-300",
    };
    return <span className={`${badgeBase} ${tones[tone] || tones.muted}`}>{children}</span>;
  };

  const items = [];
  if (trustScore > 0) items.push({ key: "trust", tone: "active", label: `trust ${trustScore}` });
  if (humanBacked || verificationLevel) items.push({ key: "verified", tone: "accent", label: verificationLevel ? `verified ${verificationLevel}` : "verified" });
  if (walletConnected) items.push({ key: "wallet", tone: "active", label: "wallet" });
  if (onchainVerified) items.push({ key: "erc8004", tone: "active", label: "on-chain" });
  if (bankrConnected) items.push({ key: "bankr", tone: "warn", label: "bankr" });

  const capSlice = variant === "compact" ? capabilities.slice(0, 2) : capabilities.slice(0, 4);
  for (const c of capSlice) {
    items.push({ key: `cap:${c}`, tone: "muted", label: c.replace(/_/g, " ") });
  }
  if (capabilities.length > capSlice.length) {
    items.push({ key: "cap:more", tone: "muted", label: `+${capabilities.length - capSlice.length}` });
  }

  if (items.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((b) => (
        <Badge key={b.key} tone={b.tone}>
          {b.label}
        </Badge>
      ))}
    </div>
  );
}

