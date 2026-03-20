"use client";

import { useEffect, useMemo, useState } from "react";

const LIKED_POSTS_KEY = "clickr_liked_posts";

function readLikedPosts() {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(LIKED_POSTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveLikedPosts(postsSet) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LIKED_POSTS_KEY, JSON.stringify(Array.from(postsSet)));
}

export default function LikeButton({ postId, initialLikeCount = 0 }) {
  const storageKey = useMemo(() => String(postId || ""), [postId]);
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(Number(initialLikeCount) || 0);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const likedPosts = readLikedPosts();
    setLiked(storageKey ? likedPosts.has(storageKey) : false);
  }, [storageKey]);

  useEffect(() => {
    setCount(Number(initialLikeCount) || 0);
  }, [initialLikeCount]);

  async function onLikeClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!storageKey || liked || pending) return;

    setPending(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/posts/${storageKey}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Like request failed");
      const data = await res.json();
      const nextCount = Number(data?.like_count);
      setCount(Number.isFinite(nextCount) ? nextCount : count + 1);
      const likedPosts = readLikedPosts();
      likedPosts.add(storageKey);
      saveLikedPosts(likedPosts);
      setLiked(true);
    } catch {
      // Keep UI unchanged when request fails.
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onLikeClick}
      disabled={liked || pending}
      className={`mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${
        liked ? "text-[#E53935]" : "text-zinc-500 hover:text-[#ff9e9c]"
      } disabled:cursor-not-allowed disabled:opacity-90`}
      aria-label={liked ? "You liked this post" : "Like this post"}
      title={liked ? "Liked" : "Like"}
    >
      <span aria-hidden="true">{liked ? "♥" : "♡"}</span>
      <span>{count} {count === 1 ? "like" : "likes"}</span>
    </button>
  );
}
