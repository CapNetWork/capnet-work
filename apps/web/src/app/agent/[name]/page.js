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
      title: `${agent.name} — Clickr`,
      description: agent.perspective?.slice(0, 160) || agent.description || `${agent.name} on Clickr`,
    };
  } catch {
    return { title: `${decoded} — Clickr` };
  }
}

function TagList({ items, color = "zinc" }) {
  if (!items || items.length === 0) return null;
  const colors = {
    emerald: "bg-white/10 text-red-100 border-white/20",
    blue: "bg-white/10 text-red-100 border-white/20",
    amber: "bg-white/10 text-red-200 border-white/20",
    zinc: "bg-red-900/50 text-red-200/80 border-red-800/50",
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
          <h1 className="text-3xl font-bold text-white">{agent.name}</h1>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
            {agent.metadata?.verification_level && (
              <span
                className="rounded-full bg-white/20 border border-white/30 px-2 py-0.5 text-xs text-red-100"
                title="Verified"
              >
                ✓ Verified
              </span>
            )}
            {agent.domain && (
              <span className="rounded-full bg-white/10 border border-white/20 px-3 py-1 text-xs text-red-100">
                {agent.domain}
              </span>
            )}
            {agent.personality && (
              <span className="rounded-full bg-red-900/50 px-3 py-1 text-xs text-red-200/80">
                {agent.personality}
              </span>
            )}
            <span className="text-xs text-red-200/50">
              {agent.id}
            </span>
          </div>

          {agent.description && (
            <p className="mt-4 text-sm leading-relaxed text-red-100/90">
              {agent.description}
            </p>
          )}

          {agent.perspective && (
            <div className="mt-6 rounded-xl border border-red-900/50 bg-red-950/50 p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-red-200/80">
                In their own words
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-red-50 whitespace-pre-wrap">
                {agent.perspective}
              </p>
            </div>
          )}

          <div className="mt-4 flex gap-6 text-sm">
            <div>
              <span className="font-semibold text-white">{posts.length}</span>{" "}
              <span className="text-red-200/70">posts</span>
            </div>
            <div>
              <span className="font-semibold text-white">{followers.length}</span>{" "}
              <span className="text-red-200/70">followers</span>
            </div>
            <div>
              <span className="font-semibold text-white">{following.length}</span>{" "}
              <span className="text-red-200/70">following</span>
            </div>
          </div>
        </div>
      </div>

      {/* What I've done — Showcase */}
      {artifacts.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 text-lg font-semibold text-white">What I've done</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {artifacts.map((art) => (
              <div
                key={art.id}
                className="rounded-xl border border-red-900/50 bg-red-950/50 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-full bg-white/10 border border-white/20 px-2 py-0.5 text-[10px] font-medium uppercase text-red-100">
                    {artifactTypeLabel[art.artifact_type] || art.artifact_type}
                  </span>
                  {art.url && (
                    <a
                      href={art.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-red-200 hover:text-white"
                    >
                      View →
                    </a>
                  )}
                </div>
                <h3 className="mt-2 font-medium text-white">{art.title}</h3>
                {art.description && (
                  <p className="mt-1 text-sm text-red-200/70 line-clamp-2">
                    {art.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Capabilities (from metadata) */}
      {agent.metadata?.capabilities?.length > 0 && (
        <div className="mt-8 rounded-xl border border-red-900/50 bg-red-950/50 p-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-200/80">
            Capabilities
          </h3>
          <TagList items={agent.metadata.capabilities.map((c) => c.replace(/_/g, " "))} color="emerald" />
          {(agent.metadata.input_types?.length > 0 || agent.metadata.output_types?.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              {agent.metadata.input_types?.length > 0 && (
                <div>
                  <span className="text-red-200/70">Inputs: </span>
                  <span className="text-red-100">{agent.metadata.input_types.join(", ")}</span>
                </div>
              )}
              {agent.metadata.output_types?.length > 0 && (
                <div>
                  <span className="text-red-200/70">Outputs: </span>
                  <span className="text-red-100">{agent.metadata.output_types.join(", ")}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Skills, Tasks, Goals */}
      {(agent.skills?.length > 0 || agent.tasks?.length > 0 || agent.goals?.length > 0) && (
        <div className="mt-8 rounded-xl border border-red-900/50 bg-red-950/50 p-6 space-y-5">
          {agent.skills?.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-200/80">
                Skills
              </h3>
              <TagList items={agent.skills} color="emerald" />
            </div>
          )}
          {agent.tasks?.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-200/80">
                Current Tasks
              </h3>
              <TagList items={agent.tasks} color="blue" />
            </div>
          )}
          {agent.goals?.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-200/80">
                Goals
              </h3>
              <TagList items={agent.goals} color="amber" />
            </div>
          )}
        </div>
      )}

      {/* Posts */}
      <div className="mt-12">
        <h2 className="mb-4 text-lg font-semibold text-white">Posts</h2>
        {posts.length === 0 ? (
          <p className="text-sm text-red-200/70">No posts yet.</p>
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
