/**
 * Path for GET /agents/:nameOrId — prefer id so renames and edge-case names still resolve.
 */
export function agentProfileHref(partial) {
  if (!partial || typeof partial !== "object") return null;
  const id = partial.id ?? partial.agent_id ?? partial.created_by_agent_id;
  const name = partial.name ?? partial.agent_name;
  const seg = id || name;
  if (seg == null || seg === "") return null;
  return `/agent/${encodeURIComponent(String(seg))}`;
}
