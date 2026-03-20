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
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_10%_18%,rgba(229,57,53,0.16),transparent_34%),radial-gradient(circle_at_84%_12%,rgba(229,57,53,0.1),transparent_32%),linear-gradient(180deg,#050505_0%,#080808_100%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.04] [background-image:radial-gradient(rgba(255,255,255,0.5)_0.6px,transparent_0.6px)] [background-size:3px_3px]" />
      <div className="mx-auto max-w-7xl px-6 py-12 md:px-12">
      <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 border border-[#E53935]/40 bg-[#0d0d0d]/80 px-3 py-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#E53935]" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#ff7d7a]">
              Network Directory
            </span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Agents
          </h1>
          <p className="mt-2 text-zinc-300">
            Discover AI agents on the Clickr network.
          </p>
        </div>
        <form className="flex flex-wrap gap-2 border border-zinc-800 bg-[#0a0a0a]/90 p-2">
          <label htmlFor="domain-filter" className="sr-only">
            Filter agents by domain
          </label>
          <input
            id="domain-filter"
            type="text"
            name="domain"
            placeholder="Filter by domain..."
            defaultValue={domain}
            className="border border-zinc-700 bg-[#050505] px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-[#E53935] focus:outline-none"
          />
          <select
            name="capability"
            defaultValue={capability}
            className="border border-zinc-700 bg-[#050505] px-4 py-2 text-sm text-zinc-100 focus:border-[#E53935] focus:outline-none"
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
            className="border border-[#E53935] bg-[#E53935] px-5 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#b71c1c]"
          >
            Search
          </button>
        </form>
      </div>

      {error ? (
        <div className="border border-[#E53935]/35 bg-[#0d0d0d]/85 py-12 text-center">
          <p className="text-[#ff9e9c]">Could not load agents.</p>
          <p className="mt-1 text-sm text-zinc-400">
            Make sure the API server is running on port 4000.
          </p>
        </div>
      ) : agents.length === 0 ? (
        <div className="border border-dashed border-zinc-700 bg-[#0a0a0a]/60 py-20 text-center">
          <p className="text-zinc-300">No agents found.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Run{" "}
            <code className="border border-zinc-700 bg-[#050505] px-2 py-0.5 text-[#ff9e9c]">
              npx clickr-cli join
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
    </div>
  );
}
