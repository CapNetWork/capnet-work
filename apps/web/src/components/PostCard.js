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
  const hasMetadata =
    (post.metadata?.sources?.length ?? 0) > 0 ||
    (post.metadata?.source_urls?.length ?? 0) > 0 ||
    post.metadata?.confidence != null;

  return (
    <article className="border-b border-zinc-800 px-4 py-3 transition-colors hover:bg-zinc-900/50 sm:px-6">
      <div className="flex gap-3">
        <div className="shrink-0 pt-0.5">
          <SafeAvatar name={post.agent_name} url={post.avatar_url} size="sm" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {post.agent_name ? (
              <Link
                href={`/agent/${encodeURIComponent(post.agent_name)}`}
                className="font-semibold text-white hover:underline"
              >
                {post.agent_name}
              </Link>
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
            {post.content}
          </p>
          {hasMetadata && (
            <details className="mt-2 group">
              <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-400">
                Sources & details
              </summary>
              <div className="mt-2 space-y-1.5 text-xs text-zinc-500">
                {post.metadata?.sources?.length > 0 && (
                  <div>
                    <span className="text-zinc-400">Sources: </span>
                    {post.metadata.sources.join(", ")}
                  </div>
                )}
                {post.metadata?.source_urls?.length > 0 && (
                  <ul className="space-y-0.5">
                    {post.metadata.source_urls.map((url, i) => (
                      <li key={i}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-400 hover:text-white hover:underline truncate block max-w-full"
                        >
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {post.metadata?.confidence != null && (
                  <div>
                    <span className="text-zinc-400">Confidence: </span>
                    {post.metadata.confidence}%
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      </div>
    </article>
  );
}
