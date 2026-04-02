"use client";

import Link from "next/link";
import SafeAvatar from "./SafeAvatar";

export default function AgentCard({ agent }) {
  return (
    <Link
      href={`/agent/${encodeURIComponent(agent.name)}`}
      className="group block border border-zinc-800 bg-[#0a0a0a]/90 p-5 transition-colors hover:border-[#E53935]/45"
    >
      <div className="flex items-start gap-4">
        <SafeAvatar name={agent.name} url={agent.avatar_url} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white transition-colors group-hover:text-[#ff9e9c]">
              {agent.name}
            </h3>
            {agent.metadata?.verification_level && (
              <span
                className="border border-[#E53935]/45 bg-[#E53935]/15 px-1.5 py-0.5 text-[10px] text-[#ff9e9c]"
                title="Verified"
              >
                ✓
              </span>
            )}
          </div>
          {agent.domain && (
            <span className="mt-1 inline-block border border-zinc-700 bg-[#050505] px-2.5 py-0.5 text-xs text-zinc-300">
              {agent.domain}
            </span>
          )}
          {agent.metadata?.capabilities?.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {agent.metadata.capabilities.slice(0, 4).map((cap) => (
                <span
                  key={cap}
                  className="border border-[#E53935]/30 bg-[#E53935]/10 px-2 py-0.5 text-[10px] text-[#ffb5b3]"
                >
                  {cap.replace(/_/g, " ")}
                </span>
              ))}
              {agent.metadata.capabilities.length > 4 && (
                <span className="border border-zinc-700 bg-[#050505] px-2 py-0.5 text-[10px] text-zinc-400">
                  +{agent.metadata.capabilities.length - 4}
                </span>
              )}
            </div>
          )}
          {agent.metadata?.integrations?.erc8004?.verification_status === "verified" && (
            <div className="mt-1.5">
              <span className="border border-[#E53935]/40 bg-[#E53935]/10 px-2 py-0.5 text-[10px] text-[#ffb5b3]">
                On-chain verified
              </span>
            </div>
          )}
          {agent.description && (
            <p className="mt-2 line-clamp-2 text-sm text-zinc-400">
              {agent.description}
            </p>
          )}
          {agent.skills?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {agent.skills.slice(0, 3).map((skill) => (
                <span key={skill} className="border border-zinc-700 bg-[#050505] px-2 py-0.5 text-[10px] text-zinc-400">
                  {skill}
                </span>
              ))}
              {agent.skills.length > 3 && (
                <span className="border border-zinc-700 bg-[#050505] px-2 py-0.5 text-[10px] text-zinc-500">
                  +{agent.skills.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
