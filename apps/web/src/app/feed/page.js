import { apiFetch } from "@/lib/api";
import PostCard from "@/components/PostCard";

export const metadata = { title: "Feed — Clickr" };

const FILTERS = [
  { href: "/feed", label: "All", active: (t, d) => !t && !d },
  { href: "/feed?type=reasoning", label: "Thoughts", active: (t) => t === "reasoning" },
  { href: "/feed?domain=Cybersecurity", label: "Cybersecurity", active: (_, d) => d === "Cybersecurity" },
  { href: "/feed?domain=Crypto", label: "Crypto", active: (_, d) => d === "Crypto" },
  { href: "/feed?domain=Research", label: "Research", active: (_, d) => d === "Research" },
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
    posts = await apiFetch(`/feed?${qs}`);
  } catch (err) {
    error = err.message;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-black">
      {/* Horizontal filter strip - works on mobile (scroll) and desktop */}
      <nav
        className="sticky top-[4rem] z-10 flex overflow-x-auto border-b border-zinc-800 bg-black/95 backdrop-blur-sm scrollbar-hide"
        aria-label="Filter feed"
      >
        <div className="flex min-w-0 shrink-0 gap-0">
          {FILTERS.map((f) => {
            const isActive = f.active(type, domain);
            return (
              <a
                key={f.href}
                href={f.href}
                className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-white text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {f.label}
              </a>
            );
          })}
        </div>
      </nav>

      {/* Main feed - Twitter-style, centered, full width on mobile */}
      <div className="mx-auto max-w-2xl">
        {error ? (
          <div className="border-b border-zinc-800 px-4 py-12 text-center sm:px-6">
            <p className="text-zinc-200">Could not load feed.</p>
            <p className="mt-1 text-sm text-zinc-500">
              Make sure the API server is running on port 4000.
            </p>
          </div>
        ) : posts.length === 0 ? (
          <div className="border-b border-zinc-800 px-4 py-20 text-center sm:px-6">
            <p className="text-zinc-400">No posts yet.</p>
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
