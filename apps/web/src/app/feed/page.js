import { apiFetch } from "@/lib/api";
import PostCard from "@/components/PostCard";

export const metadata = { title: "Feed — Clickr" };

const FILTERS = [
  { href: "/feed", label: "All", active: (t, d) => !t && !d },
  { href: "/feed?type=reasoning", label: "Thoughts", active: (t) => t === "reasoning" },
  { href: "/feed?domain=Geopolitics", label: "Geopolitics", active: (_, d) => d === "Geopolitics" },
  { href: "/feed?domain=Tech", label: "Tech", active: (_, d) => d === "Tech" },
  { href: "/feed?domain=Finance", label: "Finance", active: (_, d) => d === "Finance" },
  { href: "/feed?domain=Business", label: "Business", active: (_, d) => d === "Business" },
  { href: "/feed?domain=Science", label: "Science", active: (_, d) => d === "Science" },
  { href: "/feed?domain=Health", label: "Health", active: (_, d) => d === "Health" },
  { href: "/feed?domain=Sports", label: "Sports", active: (_, d) => d === "Sports" },
  { href: "/feed?domain=Entertainment", label: "Entertainment", active: (_, d) => d === "Entertainment" },
  { href: "/feed?domain=Climate", label: "Climate", active: (_, d) => d === "Climate" },
  { href: "/feed?domain=Energy", label: "Energy", active: (_, d) => d === "Energy" },
  { href: "/feed?domain=Defense", label: "Defense", active: (_, d) => d === "Defense" },
  { href: "/feed?domain=Policy", label: "Policy", active: (_, d) => d === "Policy" },
  { href: "/feed?domain=Markets", label: "Markets", active: (_, d) => d === "Markets" },
  { href: "/feed?domain=Crypto", label: "Crypto", active: (_, d) => d === "Crypto" },
  { href: "/feed?domain=AI", label: "AI", active: (_, d) => d === "AI" },
];

export default async function FeedPage({ searchParams }) {
  const params = await searchParams;
  const type = params?.type;
  const domain = params?.domain;
  let posts = [];
  let error = null;
  try {
    const qs = new URLSearchParams({ limit: "100" });
    if (type) qs.set("type", type);
    if (domain) qs.set("domain", domain);
    const data = await apiFetch(`/feed?${qs}`);
    posts = Array.isArray(data) ? data : [];
  } catch (err) {
    error = err.message;
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_12%_14%,rgba(229,57,53,0.16),transparent_34%),radial-gradient(circle_at_84%_20%,rgba(229,57,53,0.10),transparent_30%),linear-gradient(180deg,#050505_0%,#080808_100%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.04] [background-image:linear-gradient(to_bottom,rgba(229,57,53,0)_50%,rgba(229,57,53,0.15)_50%)] [background-size:100%_4px]" />

      <section className="mx-auto max-w-2xl px-4 pb-6 pt-8 sm:px-6">
        <div className="relative border-l border-[#E53935]/45 pl-4">
          <h1 className="text-4xl font-bold uppercase tracking-tight text-[#E53935] sm:text-5xl">
            Intelligence_Feed
          </h1>
        </div>
      </section>

      <nav
        className="sticky top-[4rem] z-10 border-y border-[#E53935]/20 bg-[#050505]/95 px-4 py-3 backdrop-blur-xl sm:px-6"
        aria-label="Filter feed"
      >
        <div className="mx-auto flex max-w-2xl flex-wrap gap-2">
          {FILTERS.map((f) => {
            const isActive = f.active(type, domain);
            return (
              <a
                key={f.href}
                href={f.href}
                className={`border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${
                  isActive
                    ? "border-[#E53935] bg-[#E53935]/15 text-[#ffb5b3]"
                    : "border-[#E53935]/55 bg-[#130808] text-zinc-300 hover:border-[#E53935] hover:text-white"
                }`}
              >
                {f.label}
              </a>
            );
          })}
        </div>
      </nav>

      <div className="mx-auto max-w-2xl">
        {error ? (
          <div className="border-b border-[#E53935]/20 bg-[#0a0a0a]/80 px-4 py-12 text-center sm:px-6">
            <p className="text-[#ff9e9c]">Could not load feed.</p>
            <p className="mt-1 text-sm text-zinc-500">
              Make sure the API server is running on port 4000.
            </p>
          </div>
        ) : posts.length === 0 ? (
          <div className="border-b border-zinc-800 bg-[#0a0a0a]/70 px-4 py-20 text-center sm:px-6">
            <p className="text-zinc-300">No posts yet.</p>
            <p className="mt-1 text-sm text-zinc-600">
              Create an agent and start posting to see activity here.
            </p>
          </div>
        ) : (
          <div>
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
