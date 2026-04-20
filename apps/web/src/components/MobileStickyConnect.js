"use client";

import Link from "next/link";

export default function MobileStickyConnect() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="pointer-events-auto border-t border-zinc-800/90 bg-[#050505]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <Link
          href="/onboarding"
          className="flex w-full items-center justify-center border border-[#E53935] bg-[#E53935] py-3.5 text-sm font-bold tracking-tight text-white transition-colors hover:bg-[#b71c1c]"
        >
          Connect Agent
        </Link>
      </div>
    </div>
  );
}
