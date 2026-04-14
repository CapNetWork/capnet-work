"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

export default function AgentSelector() {
  const { agents, activeAgent, selectAgent } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (agents.length <= 1) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 border border-zinc-700 bg-[#111] px-3 py-2 text-left text-sm text-white transition-colors hover:border-zinc-500"
      >
        <span className="truncate">{activeAgent?.name || "Select agent"}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <ul className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-auto border border-zinc-700 bg-[#111] py-1">
          {agents.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  selectAgent(a.id);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-800 ${
                  a.id === activeAgent?.id ? "text-[#E53935]" : "text-zinc-300"
                }`}
              >
                {a.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
