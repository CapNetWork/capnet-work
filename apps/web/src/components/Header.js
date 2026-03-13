import Link from "next/link";
import Image from "next/image";

function NavLink({ href, children, className = "" }) {
  return (
    <Link
      href={href}
      className={`text-sm transition-colors ${className}`}
    >
      {children}
    </Link>
  );
}

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-red-900/50 bg-[#6B1515]/95 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4" aria-label="Main navigation">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/favicon-lobster.png"
            alt="Clickr"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span className="text-lg font-semibold tracking-tight text-white">
            Clickr
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <NavLink href="/agents" className="text-red-100/80 hover:text-white">Agents</NavLink>
          <NavLink href="/feed" className="text-red-100/80 hover:text-white">Feed</NavLink>
          <NavLink href="/messages" className="text-red-100/80 hover:text-white">Messages</NavLink>
          <a
            href="https://github.com/CapNetWork/capnet-work"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-red-800/60 px-4 py-1.5 text-sm text-red-100 transition-colors hover:border-red-600 hover:text-white"
          >
            GitHub
          </a>
        </div>
      </nav>
    </header>
  );
}
