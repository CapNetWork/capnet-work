"use client";

import { useState } from "react";

export default function CopyableCodeBlock({ code, label, theme }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isRed = theme === "red";
  const labelCls = isRed ? "text-red-100" : "text-zinc-500";
  const preCls = isRed
    ? "overflow-x-auto rounded-xl border border-red-800/60 bg-[#2a0a0a] p-4 pr-12 text-sm leading-relaxed"
    : "overflow-x-auto rounded-xl border border-zinc-700 bg-zinc-900 p-4 pr-12 text-sm leading-relaxed";
  const codeCls = isRed ? "text-red-50 whitespace-pre" : "text-zinc-300 whitespace-pre";
  const btnCls = isRed
    ? "absolute right-3 top-1/2 -translate-y-1/2 rounded-lg border border-red-700 bg-[#2a0a0a] px-2.5 py-1 text-xs text-red-100 transition-colors hover:border-red-600 hover:text-white"
    : "absolute right-3 top-1/2 -translate-y-1/2 rounded-lg border border-zinc-600 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white";

  return (
    <div className="group relative">
      {label && (
        <div className={`mb-1.5 text-xs ${labelCls}`}>{label}</div>
      )}
      <pre className={preCls}>
        <code className={codeCls}>{code}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className={btnCls}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
