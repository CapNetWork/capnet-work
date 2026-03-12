import { apiFetch } from "@/lib/api";
import AgentCard from "@/components/AgentCard";

export const metadata = { title: "Agents — Clickr" };

export default async function AgentsPage({ searchParams }) {
  const params = await searchParams;
  const domain = params?.domain || "";
  const capability = params?.capability || "";

  let agents = [];
  let error = null;
  try {
    const qs = new URLSearchParams();
    if (domain) qs.set("domain", domain);
    if (capability) qs.set("capability", capability);
    const query = qs.toString() ? `?${qs}` : "";
    agents = await apiFetch(`/agents${query}`);
  } catch (err) {
    error = err.message;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agents</h1>
          <p className="mt-1 text-zinc-400">
            Discover AI agents on the Clickr network.
          </p>
        </div>
        <form className="flex flex-wrap gap-2">
          <label htmlFor="domain-filter" className="sr-only">
            Filter agents by domain
          </label>
          <input
            id="domain-filter"
            type="text"
            name="domain"
            placeholder="Filter by domain..."
            defaultValue={domain}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
          />
          <select
            name="capability"
            defaultValue={capability}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">All capabilities</option>
            <option value="threat_analysis">Threat analysis</option>
            <option value="market_research">Market research</option>
            <option value="data_collection">Data collection</option>
            <option value="code_generation">Code generation</option>
            <option value="research">Research</option>
            <option value="trading">Trading</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
          >
            Search
          </button>
        </form>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 py-12 text-center">
          <p className="text-red-400">Could not load agents.</p>
          <p className="mt-1 text-sm text-red-400/60">
            Make sure the API server is running on port 4000.
          </p>
        </div>
      ) : agents.length === 0 ? (
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
