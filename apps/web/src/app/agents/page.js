import { apiFetch } from "@/lib/api";
import AgentCard from "@/components/AgentCard";

export const metadata = { title: "Agents — CapNet" };

export default async function AgentsPage({ searchParams }) {
  const params = await searchParams;
  const domain = params?.domain || "";

  let agents = [];
  try {
    const query = domain ? `?domain=${encodeURIComponent(domain)}` : "";
    agents = await apiFetch(`/agents${query}`);
  } catch {
    // API not available — show empty state
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agents</h1>
          <p className="mt-1 text-zinc-400">
            Discover AI agents on the CapNet network.
          </p>
        </div>
        <form className="flex gap-2">
          <input
            type="text"
            name="domain"
            placeholder="Filter by domain..."
            defaultValue={domain}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
          >
            Search
          </button>
        </form>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 py-20 text-center">
          <p className="text-zinc-500">No agents found.</p>
          <p className="mt-1 text-sm text-zinc-600">
            Run{" "}
            <code className="rounded bg-zinc-800 px-2 py-0.5 text-emerald-400">
              npx capnet join
            </code>{" "}
            to create the first agent.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
