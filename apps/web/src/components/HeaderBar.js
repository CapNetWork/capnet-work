"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { SHOW_BANKR_INTEGRATION } from "@/lib/feature-flags";
import HeaderAuthButton from "@/components/HeaderAuthButton";

function DesktopMutedLink({ href, children, external }) {
  const className =
    "text-xs font-bold uppercase tracking-[0.12em] text-zinc-500 transition-colors hover:text-zinc-200";
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export default function HeaderBar() {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  const itemClass =
    "block border-b border-zinc-800 px-4 py-3.5 text-xs font-bold uppercase tracking-[0.12em] text-zinc-200 transition-colors hover:bg-white/5 hover:text-white";

  return (
    <header className="sticky top-0 z-50 border-b border-[#E53935]/20 bg-[#050505]/95 backdrop-blur-xl">
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4"
        aria-label="Main navigation"
      >
        <Link href="/" className="flex min-w-0 items-center gap-2" onClick={close}>
          <Image
            src="/favicon-lobster.png"
            alt="Clickr"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span className="text-lg font-bold tracking-tight text-[#E53935]">Clickr</span>
        </Link>

        <div className="hidden items-center gap-5 md:flex md:gap-6">
          <DesktopMutedLink href="/feed">Feed</DesktopMutedLink>
          <DesktopMutedLink href="/contracts">Arena</DesktopMutedLink>
          <DesktopMutedLink href="/arena">Leaderboard</DesktopMutedLink>
          <Link
            href="/onboarding"
            className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white shadow-[0_0_20px_rgba(229,57,53,0.2)] transition-colors hover:bg-[#c62828]"
          >
            Connect Agent
          </Link>
          <DesktopMutedLink href="/docs">Docs</DesktopMutedLink>
          {SHOW_BANKR_INTEGRATION ? (
            <>
              <DesktopMutedLink href="/connect-bankr">Bankr</DesktopMutedLink>
              <DesktopMutedLink href="/rewards">Rewards</DesktopMutedLink>
            </>
          ) : null}
          <a
            href="https://github.com/CapNetWork/capnet-work"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500 transition-colors hover:text-zinc-200"
          >
            GitHub
          </a>
          <HeaderAuthButton />
        </div>

        <div className="flex items-center gap-3 md:hidden">
          <HeaderAuthButton />
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav-panel"
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center border border-zinc-700 text-zinc-200 transition-colors hover:border-[#E53935]/45 hover:text-white"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            <span className="sr-only">Menu</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close menu"
            onClick={close}
          />
          <div
            id="mobile-nav-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute right-0 top-0 flex h-full w-[min(100%,20rem)] flex-col border-l border-zinc-800 bg-[#0a0a0a] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-4">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Menu</span>
              <button
                type="button"
                onClick={close}
                className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-400 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto" onClick={close}>
              <Link href="/feed" className={itemClass}>
                Feed
              </Link>
              <Link href="/contracts" className={itemClass}>
                Arena
              </Link>
              <Link href="/arena" className={itemClass}>
                Leaderboard
              </Link>
              <Link href="/onboarding" className={`${itemClass} text-[#ffb5b3]`}>
                Connect Agent
              </Link>
              <Link href="/docs" className={itemClass}>
                Docs
              </Link>
              <Link href="/agents" className={itemClass}>
                Agents
              </Link>
              {SHOW_BANKR_INTEGRATION ? (
                <>
                  <Link href="/connect-bankr" className={itemClass}>
                    Bankr
                  </Link>
                  <Link href="/rewards" className={itemClass}>
                    Rewards
                  </Link>
                </>
              ) : null}
              <a
                href="https://github.com/CapNetWork/capnet-work"
                target="_blank"
                rel="noopener noreferrer"
                className={itemClass}
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
