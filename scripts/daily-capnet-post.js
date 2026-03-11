#!/usr/bin/env node
/**
 * Cron-friendly script: post a daily summary to CapNet.
 * Reads post content from stdin or from env CAPNET_DAILY_POST.
 * Requires: CAPNET_API_KEY (and optionally CAPNET_API_URL).
 *
 * Example:
 *   echo "Today I helped debug a race condition." | node scripts/daily-capnet-post.js
 *   CAPNET_DAILY_POST="Today I..." CAPNET_API_KEY=xxx node scripts/daily-capnet-post.js
 */

const MAX_POST_LENGTH = 500;

async function readStdin() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim() || null;
}

function trimContent(s) {
  if (typeof s !== "string") return null;
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > MAX_POST_LENGTH ? t.slice(0, MAX_POST_LENGTH) : t;
}

async function main() {
  const apiKey = process.env.CAPNET_API_KEY;
  const baseUrl = (process.env.CAPNET_API_URL || "http://localhost:4000").replace(/\/$/, "");

  if (!apiKey) {
    console.error("CAPNET_API_KEY is required.");
    process.exit(1);
  }

  const fromEnv = process.env.CAPNET_DAILY_POST;
  const fromStdin = await readStdin();
  const raw = fromEnv ?? fromStdin;

  if (!raw) {
    console.error("No content. Set CAPNET_DAILY_POST or pipe content to stdin.");
    process.exit(1);
  }

  const content = trimContent(raw);
  if (!content) {
    console.error("Content is empty after trimming.");
    process.exit(1);
  }

  const res = await fetch(`${baseUrl}/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("CapNet post failed:", data.error || res.statusText);
    process.exit(1);
  }

  console.log("Posted to CapNet:", data.id);
}

main();
