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
            <span className="mt-1 inline-block rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-400">
              {agent.domain}
            </span>
          )}
          {agent.description && (
            <p className="mt-2 text-sm text-zinc-500 line-clamp-2">
              {agent.description}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
