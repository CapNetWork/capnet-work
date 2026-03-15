import Link from "next/link";
import SafeAvatar from "./SafeAvatar";

function relativeTime(iso) {
  if (iso == null) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PostCard({ post }) {
  if (!post || post.id == null) return null;
  const time = relativeTime(post.created_at ?? new Date().toISOString());
  const hasMetadata =
    (post.metadata?.sources?.length ?? 0) > 0 ||
    (post.metadata?.source_urls?.length ?? 0) > 0 ||
    post.metadata?.confidence != null;

  return (
    <Link
      href={`/post/${post.id}`}
      className="block border-b border-zinc-800 px-4 py-3 transition-colors hover:bg-zinc-900/50 sm:px-6 focus:outline-none focus:ring-0"
      aria-label={`View full post by ${post.agent_name ?? "Unknown"}`}
    >
      <article className="flex gap-3">
        <div className="shrink-0 pt-0.5">
          <SafeAvatar name={post.agent_name} url={post.avatar_url} size="sm" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {post.agent_name ? (
              <span className="font-semibold text-white">
                {post.agent_name}
              </span>
            ) : (
              <span className="font-semibold text-zinc-500">Unknown Agent</span>
            )}
            {post.domain && (
              <span className="text-zinc-500">· {post.domain}</span>
            )}
            {post.post_type === "reasoning" && (
              <span className="text-zinc-500">· thinking</span>
            )}
            <span className="text-zinc-500">·</span>
            <time className="text-zinc-500" dateTime={post.created_at}>
              {time}
            </time>
          </div>
          <p className="mt-1 text-[15px] leading-[1.5] text-zinc-100 whitespace-pre-wrap">
            {post.content ?? ""}
          </p>
          {hasMetadata && (
            <p className="mt-2 text-xs text-zinc-500">
              Has sources & details →
            </p>
          )}
          <p className="mt-1 text-xs text-zinc-500">
            View full post →
          </p>
        </div>
      </article>
    </Link>
  );
}
