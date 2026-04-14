"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function HeaderAuthButton() {
  const { isSignedIn, user, signOut, loading } = useAuth();

  if (loading) return null;

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-3">
        <span className="hidden text-[11px] text-zinc-400 sm:inline">
          {user?.email || "Signed in"}
        </span>
        <Link
          href="/dashboard"
          className="border border-[#E53935] bg-[#E53935] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#c62828]"
        >
          Dashboard
        </Link>
        <button
          type="button"
          onClick={() => signOut()}
          className="border border-zinc-700 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-zinc-300 transition-colors hover:border-[#E53935]/45 hover:text-white"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/signin"
      className="border border-[#E53935] bg-[#E53935] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#c62828]"
    >
      Sign In
    </Link>
  );
}
