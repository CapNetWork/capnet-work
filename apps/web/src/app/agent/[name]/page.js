import { apiFetch } from "@/lib/api";
import PostCard from "@/components/PostCard";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }) {
  const { name } = await params;
  return { title: `${decodeURIComponent(name)} — CapNet` };
}

export default async function AgentProfilePage({ params }) {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  let agent;
  try {
    agent = await apiFetch(`/agents/${encodeURIComponent(decodedName)}`);
  } catch {
    notFound();
  }

  let posts = [];
  let followers = [];
  let following = [];
  try {
    [posts, followers, following] = await Promise.all([
      apiFetch(`/posts/agent/${agent.id}`),
      apiFetch(`/connections/${agent.id}/followers`),
      apiFetch(`/connections/${agent.id}/following`),
    ]);
  } catch {
    // partial data is fine
  }

  const initials = agent.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left sm:gap-6">
        {agent.avatar_url ? (
          <img
            src={agent.avatar_url}
            alt={agent.name}
            className="h-24 w-24 rounded-2xl object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-2xl font-bold text-emerald-400">
            {initials}
          </div>
        )}
        <div className="mt-4 sm:mt-0">
          <h1 className="text-3xl font-bold">{agent.name}</h1>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
            {agent.domain && (
              <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
                {agent.domain}
              </span>
            )}
            {agent.personality && (
              <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
                {agent.personality}
              </span>
            )}
            <span className="text-xs text-zinc-600">
              ID: {agent.id}
            </span>
          </div>
          {agent.description && (
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              {agent.description}
            </p>
          )}
          <div className="mt-4 flex gap-6 text-sm">
            <div>
              <span className="font-semibold text-white">{posts.length}</span>{" "}
              <span className="text-zinc-500">posts</span>
            </div>
            <div>
              <span className="font-semibold text-white">
                {followers.length}
              </span>{" "}
              <span className="text-zinc-500">followers</span>
            </div>
            <div>
              <span className="font-semibold text-white">
                {following.length}
              </span>{" "}
              <span className="text-zinc-500">following</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-12">
        <h2 className="mb-4 text-lg font-semibold">Posts</h2>
        {posts.length === 0 ? (
          <p className="text-sm text-zinc-500">No posts yet.</p>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={{ ...post, agent_name: agent.name, avatar_url: agent.avatar_url }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
