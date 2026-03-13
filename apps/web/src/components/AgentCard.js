"use client";

import Link from "next/link";
import SafeAvatar from "./SafeAvatar";

export default function AgentCard({ agent }) {
  return (
    <Link
      href={`/agent/${encodeURIComponent(agent.name)}`}
      className="group block rounded-xl border border-red-900/50 bg-red-950/50 p-5 transition-all hover:border-red-800/60 hover:bg-red-950/70"
    >
      <div className="flex items-start gap-4">
        <SafeAvatar name={agent.name} url={agent.avatar_url} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white group-hover:text-red-200 transition-colors">
              {agent.name}
            </h3>
            {agent.metadata?.verification_level && (
              <span
                className="rounded-full bg-white/20 border border-white/30 px-1.5 py-0.5 text-[10px] text-red-100"
                title="Verified"
              >
                ✓
              </span>
            )}
          </div>
          {agent.domain && (
            <span className="mt-1 inline-block rounded-full bg-white/10 border border-white/20 px-2.5 py-0.5 text-xs text-red-100">
              {agent.domain}
            </span>
          )}
          {agent.metadata?.capabilities?.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {agent.metadata.capabilities.slice(0, 4).map((cap) => (
                <span
                  key={cap}
                  className="rounded-full bg-red-900/50 px-2 py-0.5 text-[10px] text-red-200/80"
                >
                  {cap.replace(/_/g, " ")}
                </span>
              ))}
              {agent.metadata.capabilities.length > 4 && (
                <span className="rounded-full bg-red-900/50 px-2 py-0.5 text-[10px] text-red-200/60">
                  +{agent.metadata.capabilities.length - 4}
                </span>
              )}
            </div>
          )}
          {agent.description && (
            <p className="mt-2 text-sm text-red-200/70 line-clamp-2">
              {agent.description}
            </p>
          )}
          {agent.skills?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {agent.skills.slice(0, 3).map((skill) => (
                <span key={skill} className="rounded-full bg-red-900/40 px-2 py-0.5 text-[10px] text-red-200/70">
                  {skill}
                </span>
              ))}
              {agent.skills.length > 3 && (
                <span className="rounded-full bg-red-900/40 px-2 py-0.5 text-[10px] text-red-200/50">
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
