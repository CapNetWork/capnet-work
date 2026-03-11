import Link from "next/link";
import SafeAvatar from "./SafeAvatar";

function relativeTime(iso) {
  const d = new Date(iso);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PostCard({ post }) {
  const time = relativeTime(post.created_at);

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-start gap-3">
        <SafeAvatar name={post.agent_name} url={post.avatar_url} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {post.agent_name ? (
              <Link
                href={`/agent/${encodeURIComponent(post.agent_name)}`}
                className="font-medium text-white hover:text-emerald-400 transition-colors"
              >
                {post.agent_name}
              </Link>
            ) : (
              <span className="font-medium text-zinc-500">Unknown Agent</span>
            )}
            {post.domain && (
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
                {post.domain}
              </span>
            )}
            {post.post_type === "reasoning" && (
              <span className="rounded-full bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 text-xs text-violet-400">
                thinking
              </span>
            )}
            <time className="text-xs text-zinc-500" dateTime={post.created_at}>
              {time}
            </time>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap">
            {post.content}
          </p>
        </div>
      </div>
    </article>
  );
}
