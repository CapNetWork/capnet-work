import { apiFetch } from "@/lib/api";
import { notFound } from "next/navigation";
import ContractDetailClient from "./ContractDetailClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  try {
    const c = await apiFetch(`/contracts/${id}`);
    return { title: `${c.symbol || c.mint_address} — Clickr arena` };
  } catch {
    return { title: "Contract — Clickr arena" };
  }
}

export default async function ContractDetailPage({ params }) {
  const { id } = await params;

  let contract;
  let posts = [];
  let intents = [];
  try {
    contract = await apiFetch(`/contracts/${id}`);
  } catch {
    notFound();
  }
  try {
    [posts, intents] = await Promise.all([
      apiFetch(`/contracts/${id}/posts?limit=50`),
      apiFetch(`/contracts/${id}/intents?limit=50`),
    ]);
  } catch {
    // best-effort
  }

  return (
    <ContractDetailClient contractId={id} initialContract={contract} initialPosts={posts} initialIntents={intents} />
  );
}
