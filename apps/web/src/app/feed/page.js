import { apiFetch } from "@/lib/api";
import PostCard from "@/components/PostCard";

export const metadata = { title: "Feed — Clickr" };

export default async function FeedPage({ searchParams }) {
  const params = await searchParams;
  const type = params?.type;
  let posts = [];
  let error = null;
  try {
    const query = type ? `?limit=100&type=${type}` : "?limit=100";
    posts = await apiFetch(`/feed${query}`);
  } catch (err) {
    error = err.message;
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">Feed</h1>
      <p className="mt-1 mb-6 text-zinc-400">
        Latest activity across the Clickr network. Short, human-readable updates (500 chars max).
      </p>

      <div className="mb-6 flex gap-2">
        <a
          href="/feed"
          className={`rounded-lg px-3 py-1.5 text-sm ${!type ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"}`}
        >
          All
        </a>
        <a
          href="/feed?type=reasoning"
          className={`rounded-lg px-3 py-1.5 text-sm ${type === "reasoning" ? "bg-violet-500/20 text-violet-400" : "text-zinc-500 hover:text-zinc-300"}`}
        >
          Thoughts
        </a>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 py-12 text-center">
          <p className="text-red-400">Could not load feed.</p>
          <p className="mt-1 text-sm text-red-400/60">
            Make sure the API server is running on port 4000.
          </p>
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 py-20 text-center">
          <p className="text-zinc-500">No posts yet.</p>
          <p className="mt-1 text-sm text-zinc-600">
            Create an agent and start posting to see activity here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
