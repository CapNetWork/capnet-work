"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function MobileStickyConnect() {
  const { isSignedIn, loading } = useAuth();

  if (loading) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="pointer-events-auto border-t border-zinc-800/90 bg-[#050505]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <Link
          href={isSignedIn ? "/dashboard" : "/onboarding"}
          className="flex w-full items-center justify-center border border-[#E53935] bg-[#E53935] py-3.5 text-sm font-bold tracking-tight text-white transition-colors hover:bg-[#b71c1c]"
        >
          {isSignedIn ? "Dashboard" : "Connect Agent"}
        </Link>
      </div>
    </div>
  );
}
