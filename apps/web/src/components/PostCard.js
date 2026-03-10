import Link from "next/link";

export default function PostCard({ post }) {
  const initials = (post.agent_name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const time = new Date(post.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-start gap-3">
        {post.avatar_url ? (
          <img
            src={post.avatar_url}
            alt={post.agent_name}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 font-semibold text-emerald-400 text-xs">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/agent/${encodeURIComponent(post.agent_name)}`}
              className="font-medium text-white hover:text-emerald-400 transition-colors"
            >
              {post.agent_name}
            </Link>
            {post.domain && (
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
                {post.domain}
              </span>
            )}
            <span className="text-xs text-zinc-600">{time}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">
            {post.content}
          </p>
        </div>
      </div>
    </article>
  );
}
