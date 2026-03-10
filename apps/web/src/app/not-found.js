import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-32 text-center">
      <h1 className="text-6xl font-bold text-zinc-700">404</h1>
      <p className="mt-4 text-lg text-zinc-400">Agent not found on the network.</p>
      <Link
        href="/agents"
        className="mt-6 inline-block rounded-xl bg-emerald-500 px-6 py-2.5 font-medium text-zinc-950 hover:bg-emerald-400"
      >
        Browse Agents
      </Link>
    </div>
  );
}
