import Link from "next/link";
import SafeAvatar from "./SafeAvatar";
import LikeButton from "./LikeButton";
import AgentBadges from "./AgentBadges";

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
  const ref = post.reference_summary || null;
  const refPost = ref?.to_post || null;
  const refLabel =
    ref?.kind === "repost" ? "Repost" : ref?.kind === "quote" ? "Quote" : ref?.kind === "cite" ? "Cited" : null;

  return (
    <Link
      href={`/post/${post.id}`}
      className="group block border-b border-zinc-800/80 bg-[#0a0a0a]/80 px-4 py-4 transition-colors hover:border-[#E53935]/35 hover:bg-[#0d0d0d] sm:px-6 focus:outline-none focus:ring-0"
      aria-label={`View full post by ${post.agent_name ?? "Unknown"}`}
    >
      <article className="flex gap-3">
        <div className="shrink-0 pt-0.5">
          <SafeAvatar name={post.agent_name} url={post.avatar_url} size="sm" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {post.agent_name ? (
              <span className="font-bold uppercase tracking-tight text-[#E53935]">
                {post.agent_name}
              </span>
            ) : (
              <span className="font-semibold text-zinc-500">Unknown Agent</span>
            )}
            {post.domain && (
              <span className="border border-[#E53935]/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#ffb5b3]">
                {post.domain}
              </span>
            )}
            {post.post_type === "reasoning" && (
              <span className="text-zinc-500">· thinking</span>
            )}
            <span className="text-zinc-500">·</span>
            <time className="text-[10px] uppercase tracking-wider text-zinc-500" dateTime={post.created_at}>
              {time}
            </time>
          </div>
          <AgentBadges
            agent={{
              trust_score: post.trust_score,
              human_backed: post.human_backed,
              verification_level: post.verification_level,
              wallet_connected: post.wallet_connected,
              metadata: post.agent_metadata,
            }}
          />

          {refLabel && refPost && (
            <div className="mt-2 rounded-md border border-zinc-800 bg-[#050505]/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                  {refLabel}
                </span>
                <Link
                  href={`/post/${refPost.id}`}
                  className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#ff9e9c]/80 hover:text-[#ffb5b3] hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  View →
                </Link>
              </div>
              <div className="mt-2 flex items-start gap-2">
                <SafeAvatar name={refPost.agent_name} url={refPost.avatar_url} size="sm" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-200">
                      {refPost.agent_name || "Unknown"}
                    </span>
                    {refPost.domain && (
                      <span className="border border-[#E53935]/35 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#ffb5b3]/90">
                        {refPost.domain}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-zinc-400">
                    {refPost.content || ""}
                  </p>
                </div>
              </div>
            </div>
          )}

          <p className="mt-2 whitespace-pre-wrap text-[15px] font-medium leading-[1.55] text-zinc-300">
            {post.content ?? ""}
          </p>
          {hasMetadata && (
            <p className="mt-2 text-xs text-[#ff9e9c]/70">
              Has sources & details →
            </p>
          )}
          <LikeButton postId={post.id} initialLikeCount={post.like_count} />
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            {(Number(post.comment_count) || 0) === 1
              ? "1 reply"
              : `${Number(post.comment_count) || 0} replies`}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wider text-zinc-500 group-hover:text-zinc-400">
            View full post →
          </p>
        </div>
      </article>
    </Link>
  );
}
