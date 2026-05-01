"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getIntegrationNavGroups } from "@/lib/integrationHighlights";

const NAV_GROUPS = getIntegrationNavGroups();

function MegaPanel({ onPick }) {
  return (
    <div
      className="absolute right-0 top-full z-[70] mt-2 w-[min(calc(100vw-2rem),72rem)] border border-zinc-700 bg-[#0a0a0a] p-4 shadow-2xl shadow-black/50"
      role="menu"
      aria-label="Integrations by category"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {NAV_GROUPS.map((g) => (
          <div
            key={g.id}
            className={`rounded-lg bg-[#050505]/90 p-3 ring-1 ring-inset ${g.ring}`}
            role="none"
          >
            <div className={`mb-2 h-0.5 w-8 rounded-full ${g.bar}`} aria-hidden />
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-300">{g.title}</p>
            <p className="mt-0.5 text-[10px] text-zinc-600">{g.subtitle}</p>
            <ul className="mt-3 space-y-1" role="none">
              {g.items.map((item) => (
                <li key={item.label} role="none">
                  <Link
                    href={item.href}
                    role="menuitem"
                    onClick={onPick}
                    className="block rounded-md px-2 py-2 transition-colors hover:bg-white/[0.06]"
                  >
                    <span className="text-xs font-bold uppercase tracking-[0.1em] text-white">{item.label}</span>
                    <span className="mt-0.5 block text-[10px] text-zinc-500">{item.blurb}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Link
        href="/integrations"
        role="menuitem"
        onClick={onPick}
        className="mt-3 block border-t border-zinc-800 pt-3 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 transition-colors hover:text-[#ff9e9c]"
      >
        View all agent integrations →
      </Link>
    </div>
  );
}

/** Desktop: button opens mega menu. Mobile: stacked blocks for drawer (pass onNavigate to close drawer). */
export default function IntegrationsMegaNav({ variant = "desktop", onNavigate }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open || variant !== "desktop") return;
    function onPointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) close();
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, variant]);

  const handlePick = useCallback(() => {
    close();
    onNavigate?.();
  }, [close, onNavigate]);

  if (variant === "mobile") {
    return (
      <div className="border-b border-zinc-800">
        <div className="border-b border-zinc-800 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Integrations</p>
          <p className="mt-1 text-xs text-zinc-400">By category</p>
        </div>
        {NAV_GROUPS.map((g) => (
          <div key={g.id} className={`border-b border-zinc-800/80 px-4 py-3 ring-1 ring-inset ring-transparent ${g.ring}`}>
            <div className={`mb-2 h-0.5 w-6 rounded-full ${g.bar}`} aria-hidden />
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-300">{g.title}</p>
            <ul className="mt-2 space-y-0.5">
              {g.items.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className="block rounded-md px-2 py-2 text-xs font-bold uppercase tracking-[0.1em] text-zinc-200 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    {item.label}
                    <span className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-zinc-500">
                      {item.blurb}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <Link
          href="/integrations"
          onClick={onNavigate}
          className="block px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 transition-colors hover:bg-white/5 hover:text-[#ff9e9c]"
        >
          All agent integrations →
        </Link>
      </div>
    );
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-zinc-300 transition-colors hover:text-white"
      >
        Integrations
        <svg
          className={`h-3 w-3 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open ? <MegaPanel onPick={handlePick} /> : null}
    </div>
  );
}
