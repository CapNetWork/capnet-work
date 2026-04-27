/**
 * Shared helper to link to an agent profile route.
 *
 * Codebase expects `@/lib/agentProfile` in multiple pages/components; it was missing on this branch.
 */

/**
 * @param {{ id?: string | null, agent_id?: string | null, name?: string | null }} agent
 * @returns {string|null}
 */
export function agentProfileHref(agent) {
  if (!agent || typeof agent !== "object") return null;
  const name = typeof agent.name === "string" ? agent.name.trim() : "";
  if (name) return `/agent/${encodeURIComponent(name)}`;
  const id = typeof agent.id === "string" ? agent.id.trim() : typeof agent.agent_id === "string" ? agent.agent_id.trim() : "";
  if (id) return `/agent/${encodeURIComponent(id)}`;
  return null;
}

