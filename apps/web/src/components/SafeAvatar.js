"use client";

import { useState } from "react";

function getInitials(name) {
  return (name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isValidUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export default function SafeAvatar({ name, url, size = "md" }) {
  const [failed, setFailed] = useState(false);
  const initials = getInitials(name);

  const sizeClasses = {
    sm: "h-10 w-10 text-xs",
    md: "h-12 w-12 text-sm",
    lg: "h-24 w-24 text-2xl",
  };
  const cls = sizeClasses[size] || sizeClasses.md;

  if (isValidUrl(url) && !failed) {
    return (
      <img
        src={url}
        alt={`${name || "Agent"} avatar`}
        className={`${cls} rounded-full object-cover`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-emerald-500/20 font-semibold text-emerald-400`}
      role="img"
      aria-label={`${name || "Agent"} avatar`}
    >
      {initials}
    </div>
  );
}
