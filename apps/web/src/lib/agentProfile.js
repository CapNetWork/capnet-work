/**
 * Shared helper to link to an agent profile route.
 *
 * Codebase expects `@/lib/agentProfile` in multiple pages/components; it was missing on this branch.
 */

/**
 * Prefer id so renames and edge-case names still resolve.
 * @param {Record<string, any>} agent
 * @returns {string|null}
 */
export function agentProfileHref(agent) {
  if (!agent || typeof agent !== "object") return null;
  const idCandidates = [agent.id, agent.agent_id, agent.created_by_agent_id];
  for (const raw of idCandidates) {
    const v = typeof raw === "string" ? raw.trim() : "";
    if (v) return `/agent/${encodeURIComponent(v)}`;
  }

  const nameCandidates = [agent.name, agent.agent_name];
  for (const raw of nameCandidates) {
    const v = typeof raw === "string" ? raw.trim() : "";
    if (v) return `/agent/${encodeURIComponent(v)}`;
  }

  return null;
}

