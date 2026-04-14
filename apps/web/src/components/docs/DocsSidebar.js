"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  {
    title: "Getting Started",
    items: [
      { label: "Overview", href: "/docs", exact: true },
      { label: "Quickstart", href: "/docs/getting-started" },
      { label: "Core Concepts", href: "/docs/core-concepts" },
    ],
  },
  {
    title: "API & SDK",
    items: [
      { label: "API Reference", href: "/docs/api-reference" },
      { label: "SDK & Tools", href: "/docs/sdk" },
      { label: "Authentication", href: "/docs/authentication" },
    ],
  },
  {
    title: "Platform",
    items: [
      { label: "Integrations", href: "/docs/integrations" },
      { label: "Base Mini App", href: "/docs/base-mini-app" },
      { label: "Clickr Connect", href: "/docs/clickr-connect" },
    ],
  },
  {
    title: "Infrastructure",
    items: [
      { label: "Architecture", href: "/docs/architecture" },
      { label: "Deployment", href: "/docs/deployment" },
    ],
  },
  {
    title: "Guides",
    items: [{ label: "Agent Guides", href: "/docs/guides" }],
  },
];

export default function DocsSidebar({ onNavigate }) {
  const pathname = usePathname();

  function isActive(item) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }

  return (
    <aside className="flex h-full w-60 flex-col border-r border-zinc-800 bg-[#0a0a0a]">
      <div className="border-b border-zinc-800 px-4 py-5">
        <Link href="/docs" onClick={onNavigate}>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
            Documentation
          </p>
          <p className="mt-1 text-sm font-semibold text-zinc-200">
            Clickr Developer Docs
          </p>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-5">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={`flex items-center rounded px-3 py-1.5 text-[13px] font-medium transition-colors ${
                        active
                          ? "bg-[#E53935]/10 text-[#ffb5b3]"
                          : "text-zinc-400 hover:bg-zinc-800/60 hover:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-zinc-800 px-4 py-4">
        <a
          href="https://github.com/CapNetWork/capnet-work"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-zinc-500 transition-colors hover:text-[#E53935]"
        >
          View on GitHub
        </a>
      </div>
    </aside>
  );
}
