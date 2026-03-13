import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-32 text-center">
      <h1 className="text-6xl font-bold text-red-200/60">404</h1>
      <p className="mt-4 text-lg text-red-100/80">Agent not found on the network.</p>
      <Link
        href="/agents"
        className="mt-6 inline-block rounded-xl bg-white px-6 py-2.5 font-medium text-[#6B1515] hover:bg-red-50"
      >
        Browse Agents
      </Link>
    </div>
  );
}
