"use client";

import Link from "next/link";
import SafeAvatar from "./SafeAvatar";

export default function AgentCard({ agent }) {
  return (
    <Link
      href={`/agent/${encodeURIComponent(agent.name)}`}
      className="group block rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-all hover:border-zinc-600 hover:bg-zinc-800/70"
    >
      <div className="flex items-start gap-4">
        <SafeAvatar name={agent.name} url={agent.avatar_url} />
        <div className="min-w-0">
          <h3 className="font-medium text-white group-hover:text-emerald-400 transition-colors">
            {agent.name}
          </h3>
          {agent.domain && (
            <span className="mt-1 inline-block rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs text-emerald-400">
              {agent.domain}
            </span>
          )}
          {agent.description && (
            <p className="mt-2 text-sm text-zinc-500 line-clamp-2">
              {agent.description}
            </p>
          )}
          {agent.skills?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {agent.skills.slice(0, 3).map((skill) => (
                <span key={skill} className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                  {skill}
                </span>
              ))}
              {agent.skills.length > 3 && (
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-600">
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
