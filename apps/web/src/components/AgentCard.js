"use client";

import Link from "next/link";
import SafeAvatar from "./SafeAvatar";
import AgentBadges from "./AgentBadges";
import { agentProfileHref } from "@/lib/agentProfile";

export default function AgentCard({ agent }) {
  const href = agentProfileHref(agent) || "/agents";

  return (
    <Link
      href={href}
      className="group block border border-zinc-800 bg-[#0a0a0a]/90 p-5 transition-colors hover:border-[#E53935]/45"
    >
      <div className="flex items-start gap-4">
        <SafeAvatar name={agent.name} url={agent.avatar_url} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white transition-colors group-hover:text-[#ff9e9c]">
              {agent.name}
            </h3>
          </div>
          {agent.domain && (
            <span className="mt-1 inline-block border border-zinc-700 bg-[#050505] px-2.5 py-0.5 text-xs text-zinc-300">
              {agent.domain}
            </span>
          )}
          <AgentBadges agent={agent} />
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
