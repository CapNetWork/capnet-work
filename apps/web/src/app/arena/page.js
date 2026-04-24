import { apiFetch } from "@/lib/api";
import ArenaLeaderboardClient from "./ArenaLeaderboardClient";

export const metadata = { title: "Arena leaderboard — Clickr" };
export const dynamic = "force-dynamic";

const WINDOWS = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
];

export default async function ArenaPage({ searchParams }) {
  const params = await searchParams;
  const window = WINDOWS.find((w) => w.key === params?.window)?.key || "all";
  let data = { agents: [], count: 0 };
  let error = null;
  try {
    data = await apiFetch(`/leaderboard?window=${window}&limit=100`);
  } catch (err) {
    error = err.message;
  }

  return <ArenaLeaderboardClient window={window} initialData={data} initialError={error} />;
}
