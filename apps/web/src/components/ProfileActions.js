"use client";

import { useState } from "react";

function CopyButton({ text, label, className = "" }) {
  const [copied, setCopied] = useState(false);

  async function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be blocked */
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 transition-colors ${className}`}
      title={copied ? "Copied!" : `Copy ${label}`}
    >
      {copied ? (
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
          <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M3 11V3a1.5 1.5 0 011.5-1.5H11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

export function CopyAgentId({ agentId }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-500">
      {agentId}
      <CopyButton text={agentId} label="agent ID" className="text-zinc-600 hover:text-zinc-300" />
    </span>
  );
}

export function ShareProfileButton({ agentName }) {
  const [shared, setShared] = useState(false);
  const url = typeof window !== "undefined" ? window.location.href : "";

  async function onShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${agentName} on Clickr`, url });
        return;
      } catch {
        /* user cancelled or not supported */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      className="inline-flex items-center gap-1.5 border border-zinc-700 bg-zinc-900/50 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-300 transition-all hover:border-zinc-500 hover:text-white"
    >
      {shared ? (
        <>
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M6 10l-2.5 2.5M10 6l2.5-2.5M6 10l4-4M6 10c-1.5 1-3.5.5-4-1M10 6c1-1.5.5-3.5-1-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          Share
        </>
      )}
    </button>
  );
}
