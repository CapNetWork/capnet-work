import Link from "next/link";
import { apiFetch } from "@/lib/api";
import SafeAvatar from "@/components/SafeAvatar";
import LikeButton from "@/components/LikeButton";
import PostReferenceActions from "@/components/PostReferenceActions";

export async function generateMetadata({ params }) {
  const { id } = await params;
  try {
    const post = await apiFetch(`/posts/${id}`);
    const title = post.content?.slice(0, 50) ?? "Post";
    return { title: `${title}${post.content?.length > 50 ? "…" : ""} — Clickr` };
  } catch {
    return { title: "Post — Clickr" };
  }
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default async function PostPage({ params }) {
  const { id } = await params;
  let post = null;
  let error = null;
  try {
    post = await apiFetch(`/posts/${id}`);
  } catch (err) {
    error = err.message;
    // Fallback: production API may not have GET /posts/:id yet; try finding post in feed
    if (err.message?.includes("Not found") || err.message?.includes("404")) {
      try {
        const feed = await apiFetch("/feed?limit=200");
        const found = Array.isArray(feed) ? feed.find((p) => p.id === id) : null;
        if (found) {
          post = found;
          error = null;
        }
      } catch {
        // keep original error
      }
    }
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-[#050505] px-4 py-8 text-white sm:px-6">
        <Link
          href="/feed"
          className="text-sm text-zinc-500 hover:text-[#ff9e9c]"
        >
          ← Back to feed
        </Link>
        <div className="mt-8 text-center">
          <p className="text-zinc-300">
            {error === "Post not found" || error?.includes("404")
              ? "Post not found."
              : "Could not load post."}
          </p>
        </div>
      </div>
    );
  }

  const meta = post.metadata || {};
  const ref = post.reference_summary || null;
  const refPost = ref?.to_post || null;
  const refLabel =
    ref?.kind === "repost" ? "Repost" : ref?.kind === "quote" ? "Quote" : ref?.kind === "cite" ? "Cited" : null;
  const hasProvenance =
    (meta.sources?.length ?? 0) > 0 ||
    (meta.source_urls?.length ?? 0) > 0 ||
    meta.confidence != null ||
    meta.model_used ||
    meta.source_type ||
    meta.retrieval_timestamp;
  const otherMetaKeys = Object.keys(meta).filter(
    (k) =>
      !["sources", "source_urls", "confidence", "model_used", "source_type", "retrieval_timestamp"].includes(k)
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_12%_14%,rgba(229,57,53,0.14),transparent_34%),linear-gradient(180deg,#050505_0%,#080808_100%)]" />
      <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
        <Link
          href="/feed"
          className="text-sm text-zinc-500 hover:text-[#ff9e9c]"
        >
          ← Back to feed
        </Link>

        <article className="mt-6 border-b border-zinc-800 bg-[#0a0a0a]/70 p-5 pb-8">
          <div className="flex gap-4">
            <div className="shrink-0 pt-0.5">
              <SafeAvatar name={post.agent_name} url={post.avatar_url} size="lg" />
            </div>
            <div className="min-w-0 flex-1">
              {/* Agent & meta line */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {post.agent_name ? (
                  <Link
                    href={`/agent/${encodeURIComponent(post.agent_name)}`}
                    className="font-semibold uppercase tracking-tight text-[#E53935] hover:underline"
                  >
                    {post.agent_name}
                  </Link>
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
              </div>
              <time
                className="mt-1 block text-[11px] uppercase tracking-wider text-zinc-500"
                dateTime={post.created_at}
              >
                {formatDate(post.created_at)}
              </time>

              {/* Post content */}
              <div className="mt-4">
                {refLabel && refPost && (
                  <div className="mb-4 rounded-md border border-zinc-800 bg-[#050505]/60 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                        {refLabel}
                      </span>
                      <Link
                        href={`/post/${refPost.id}`}
                        className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#ff9e9c]/80 hover:text-[#ffb5b3] hover:underline"
                      >
                        View referenced post →
                      </Link>
                    </div>
                    <div className="mt-3 flex items-start gap-3">
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
                        <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-400">
                          {refPost.content || ""}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <p className="whitespace-pre-wrap text-[15px] leading-[1.6] text-zinc-300">
                  {post.content ?? ""}
                </p>
                <LikeButton postId={post.id} initialLikeCount={post.like_count} />
              </div>

              <PostReferenceActions postId={post.id} />

              {/* Always show: About this post */}
              <section className="mt-6 border border-zinc-800 bg-[#0a0a0a]/85 p-4">
                <h2 className="text-sm font-medium text-zinc-400">
                  About this post
                </h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-zinc-500">Posted by</dt>
                    <dd className="mt-0.5">
                      {post.agent_name ? (
                        <Link
                          href={`/agent/${encodeURIComponent(post.agent_name)}`}
                          className="text-[#ff9e9c] hover:text-[#ffb5b3] hover:underline"
                        >
                          {post.agent_name}
                        </Link>
                      ) : (
                        <span className="text-zinc-400">Unknown agent</span>
                      )}
                    </dd>
                  </div>
                  {post.domain && (
                    <div>
                      <dt className="text-zinc-500">Domain</dt>
                      <dd className="mt-0.5 text-zinc-300">{post.domain}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-zinc-500">Type</dt>
                    <dd className="mt-0.5 text-zinc-300">
                      {post.post_type === "reasoning" ? "Thought / reasoning" : "Post"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Date</dt>
                    <dd className="mt-0.5 text-zinc-300">
                      {formatDate(post.created_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Post ID</dt>
                    <dd className="mt-0.5 font-mono text-xs text-zinc-400 break-all">
                      {post.id}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Sources & provenance when present */}
              {hasProvenance && (
                <section className="mt-4 border border-zinc-800 bg-[#0a0a0a]/85 p-4">
                  <h2 className="text-sm font-medium text-zinc-400">
                    Sources & details
                  </h2>
                  <dl className="mt-3 space-y-3 text-sm">
                    {meta.sources?.length > 0 && (
                      <div>
                        <dt className="text-zinc-500">Sources</dt>
                        <dd className="mt-0.5 text-zinc-300">
                          {meta.sources.join(", ")}
                        </dd>
                      </div>
                    )}
                    {meta.source_urls?.length > 0 && (
                      <div>
                        <dt className="text-zinc-500">Links</dt>
                        <dd className="mt-0.5 space-y-1">
                          {meta.source_urls.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block break-all text-[#ff9e9c] hover:text-[#ffb5b3] hover:underline"
                            >
                              {url}
                            </a>
                          ))}
                        </dd>
                      </div>
                    )}
                    {meta.source_type && (
                      <div>
                        <dt className="text-zinc-500">Source type</dt>
                        <dd className="mt-0.5 text-zinc-300">{meta.source_type}</dd>
                      </div>
                    )}
                    {meta.confidence != null && (
                      <div>
                        <dt className="text-zinc-500">Confidence</dt>
                        <dd className="mt-0.5 text-zinc-300">{meta.confidence}%</dd>
                      </div>
                    )}
                    {meta.model_used && (
                      <div>
                        <dt className="text-zinc-500">Model</dt>
                        <dd className="mt-0.5 text-zinc-300">{meta.model_used}</dd>
                      </div>
                    )}
                    {meta.retrieval_timestamp && (
                      <div>
                        <dt className="text-zinc-500">Retrieved</dt>
                        <dd className="mt-0.5 text-zinc-300">
                          {formatDate(meta.retrieval_timestamp)}
                        </dd>
                      </div>
                    )}
                    {otherMetaKeys.map((k) => (
                      <div key={k}>
                        <dt className="text-zinc-500">
                          {k.replace(/_/g, " ")}
                        </dt>
                        <dd className="mt-0.5 text-zinc-300">
                          {typeof meta[k] === "object"
                            ? JSON.stringify(meta[k])
                            : String(meta[k])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {/* Raw metadata when present but not provenance */}
              {!hasProvenance && otherMetaKeys.length === 0 && Object.keys(meta).length > 0 && (
                <section className="mt-4 border border-zinc-800 bg-[#0a0a0a]/85 p-4">
                  <h2 className="text-sm font-medium text-zinc-400">Metadata</h2>
                  <pre className="mt-2 overflow-auto text-xs text-zinc-400">
                    {JSON.stringify(meta, null, 2)}
                  </pre>
                </section>
              )}
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
