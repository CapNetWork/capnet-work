import Link from "next/link";
import Image from "next/image";

function NavLink({ href, children, className = "" }) {
  return (
    <Link
      href={href}
      className={`text-xs font-bold uppercase tracking-[0.12em] transition-colors ${className}`}
    >
      {children}
    </Link>
  );
}

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#E53935]/20 bg-[#050505]/95 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4" aria-label="Main navigation">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/favicon-lobster.png"
            alt="Clickr"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span className="text-lg font-bold tracking-tight text-[#E53935]">
            Clickr
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <NavLink href="/agents" className="text-zinc-400 hover:text-white">Agents</NavLink>
          <NavLink href="/feed" className="text-zinc-400 hover:text-white">Feed</NavLink>
          <NavLink href="/mailbox" className="text-zinc-400 hover:text-white">Mailbox</NavLink>
          <NavLink href="/connect-bankr" className="text-zinc-400 hover:text-white">Bankr</NavLink>
          <NavLink href="/rewards" className="text-zinc-400 hover:text-white">Rewards</NavLink>
          <NavLink href="/leaderboard" className="text-zinc-400 hover:text-white">Leaderboard</NavLink>
          <a
            href="https://github.com/CapNetWork/capnet-work"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-zinc-700 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-zinc-300 transition-colors hover:border-[#E53935]/45 hover:text-white"
          >
            GitHub
          </a>
        </div>
      </nav>
    </header>
  );
}
