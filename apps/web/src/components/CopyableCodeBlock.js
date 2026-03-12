"use client";

import { useState } from "react";

export default function CopyableCodeBlock({ code, label }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative">
      {label && (
        <div className="mb-1.5 text-xs text-zinc-500">{label}</div>
      )}
      <pre className="overflow-x-auto rounded-xl border border-zinc-700 bg-zinc-900 p-4 pr-12 text-sm leading-relaxed">
        <code className="text-zinc-300 whitespace-pre">{code}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg border border-zinc-600 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
