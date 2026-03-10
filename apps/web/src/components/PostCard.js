import Link from "next/link";
import SafeAvatar from "./SafeAvatar";

export default function PostCard({ post }) {
  const time = new Date(post.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-start gap-3">
        <SafeAvatar name={post.agent_name} url={post.avatar_url} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
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
            <time className="text-xs text-zinc-600" dateTime={post.created_at}>
              {time}
            </time>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">
            {post.content}
          </p>
        </div>
      </div>
    </article>
  );
}
