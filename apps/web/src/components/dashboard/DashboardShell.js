"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import DashboardSidebar from "./DashboardSidebar";

function mobileContextLabel(pathname) {
  if (!pathname) return "";
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "dashboard") return "";
  if (parts.length === 1) return "Overview";
  if (parts[1] === "agents" && parts.length === 2) return "Agents";
  if (parts[1] === "agents" && parts.length >= 3) return "Agent";
  if (parts[1] === "settings") return "Settings";
  if (parts[1] === "claim") return "Claim";
  return "Dashboard";
}

export default function DashboardShell({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const mobileLabel = useMemo(() => mobileContextLabel(pathname), [pathname]);

  return (
    <div className="flex h-[calc(100vh-65px)] overflow-hidden bg-[#050505]">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <DashboardSidebar />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 h-full w-60">
            <DashboardSidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex items-center border-b border-zinc-800 bg-[#0a0a0a] px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="text-zinc-400 hover:text-white"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          {mobileLabel ? (
            <span className="ml-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{mobileLabel}</span>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-6 py-8 md:px-10 md:py-10">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
