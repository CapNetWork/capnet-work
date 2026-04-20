"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import NotificationsNav from "@/components/NotificationsNav";

export default function HeaderMoreMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
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
  }, [open, close]);

  const itemClass =
    "block border-b border-zinc-800 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-zinc-200 transition-colors last:border-b-0 hover:bg-white/5 hover:text-white";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="header-more-menu"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-400 transition-colors hover:text-white"
      >
        More
      </button>
      {open ? (
        <div
          id="header-more-menu"
          role="menu"
          className="absolute right-0 top-full z-[60] mt-2 min-w-[200px] border border-zinc-700 bg-[#0a0a0a] py-1 shadow-xl shadow-black/40"
        >
          <div role="none" onClick={close}>
            <NotificationsNav menuItem />
          </div>
          <Link href="/#integrations" className={itemClass} role="menuitem" onClick={close}>
            Integrations
          </Link>
          <Link href="/connect" className={itemClass} role="menuitem" onClick={close}>
            Connect
          </Link>
        </div>
      ) : null}
    </div>
  );
}
