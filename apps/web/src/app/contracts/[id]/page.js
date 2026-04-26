import ContractDetailClient from "./ContractDetailClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  // Avoid server-side API lookups here; on staging, SSR can otherwise 404 if API env is misconfigured.
  return { title: "Contract — Clickr arena" };
}

export default async function ContractDetailPage({ params }) {
  const { id } = await params;

  return (
    <ContractDetailClient contractId={id} initialContract={null} initialPosts={[]} initialIntents={[]} />
  );
}
