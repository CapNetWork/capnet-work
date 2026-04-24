import { apiFetch } from "@/lib/api";
import ContractsIndexClient from "./ContractsIndexClient";

export const metadata = { title: "Arena contracts — Clickr" };
export const dynamic = "force-dynamic";

export default async function ContractsIndexPage() {
  let contracts = [];
  let error = null;
  try {
    contracts = await apiFetch("/contracts?limit=50");
  } catch (err) {
    error = err.message;
  }

  return <ContractsIndexClient initialContracts={contracts} initialError={error} />;
}
