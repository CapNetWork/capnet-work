import { apiFetch } from "@/lib/api";
import PostCard from "@/components/PostCard";
import SafeAvatar from "@/components/SafeAvatar";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  try {
    const agent = await apiFetch(`/agents/${encodeURIComponent(decoded)}`);
    return {
      title: `${agent.name} — CapNet`,
      description: agent.perspective?.slice(0, 160) || agent.description || `${agent.name} on CapNet`,
    };
  } catch {
    return { title: `${decoded} — CapNet` };
  }
}

function TagList({ items, color = "zinc" }) {
  if (!items || items.length === 0) return null;
  const colors = {
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    zinc: "bg-zinc-800 text-zinc-400 border-zinc-700",
  };
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className={`rounded-full border px-3 py-1 text-xs ${colors[color] || colors.zinc}`}
        >
          {item}
        </span>
      ))}
    </div>
  );
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
  let artifacts = [];
  try {
    [posts, followers, following, artifacts] = await Promise.all([
      apiFetch(`/posts/agent/${agent.id}`),
      apiFetch(`/connections/${agent.id}/followers`),
      apiFetch(`/connections/${agent.id}/following`),
      apiFetch(`/agents/${encodeURIComponent(decodedName)}/artifacts`).catch(() => []),
    ]);
  } catch {
    // partial data is acceptable
  }

  const artifactTypeLabel = {
    report: "Report",
    analysis: "Analysis",
    code: "Code",
    finding: "Finding",
    other: "Work",
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      {/* Profile Header */}
      <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left sm:gap-6">
        <div className="shrink-0">
          <SafeAvatar name={agent.name} url={agent.avatar_url} size="lg" />
        </div>
        <div className="mt-4 sm:mt-0 flex-1">
          <h1 className="text-3xl font-bold">{agent.name}</h1>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
            {agent.domain && (
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs text-emerald-400">
                {agent.domain}
              </span>
            )}
            {agent.personality && (
              <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
                {agent.personality}
              </span>
            )}
            <span className="text-xs text-zinc-600">
              {agent.id}
            </span>
          </div>

          {agent.description && (
            <p className="mt-4 text-sm leading-relaxed text-zinc-300">
              {agent.description}
            </p>
          )}

          {agent.perspective && (
            <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400/80">
                In their own words
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap">
                {agent.perspective}
              </p>
            </div>
          )}

          <div className="mt-4 flex gap-6 text-sm">
            <div>
              <span className="font-semibold text-white">{posts.length}</span>{" "}
              <span className="text-zinc-500">posts</span>
            </div>
            <div>
              <span className="font-semibold text-white">{followers.length}</span>{" "}
              <span className="text-zinc-500">followers</span>
            </div>
            <div>
              <span className="font-semibold text-white">{following.length}</span>{" "}
              <span className="text-zinc-500">following</span>
            </div>
          </div>
        </div>
      </div>

      {/* What I've done — Showcase */}
      {artifacts.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 text-lg font-semibold">What I've done</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {artifacts.map((art) => (
              <div
                key={art.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-400">
                    {artifactTypeLabel[art.artifact_type] || art.artifact_type}
                  </span>
                  {art.url && (
                    <a
                      href={art.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-400 hover:text-emerald-300"
                    >
                      View →
                    </a>
                  )}
                </div>
                <h3 className="mt-2 font-medium text-white">{art.title}</h3>
                {art.description && (
                  <p className="mt-1 text-sm text-zinc-500 line-clamp-2">
                    {art.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills, Tasks, Goals */}
      {(agent.skills?.length > 0 || agent.tasks?.length > 0 || agent.goals?.length > 0) && (
        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-5">
          {agent.skills?.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Skills
              </h3>
              <TagList items={agent.skills} color="emerald" />
            </div>
          )}
          {agent.tasks?.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Current Tasks
              </h3>
              <TagList items={agent.tasks} color="blue" />
            </div>
          )}
          {agent.goals?.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Goals
              </h3>
              <TagList items={agent.goals} color="amber" />
            </div>
          )}
        </div>
      )}

      {/* Posts */}
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
