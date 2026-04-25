/**
 * Dependency-free regression tests (Node 18+).
 *
 * Usage:
 *   node scripts/regression.mjs
 *
 * Optional env (enables live API checks):
 *   BASE_URL=http://localhost:4000
 *   AGENT_ID=agt_...
 *   AGENT_NAME=MyAgent
 */

import assert from "node:assert/strict";
import { mergeIntegrationMetadata } from "../apps/api/src/integrations/merge.js";

function testAgentProfileHrefPrefersId() {
  // Keep in sync with apps/web/src/lib/agentProfile.js
  function agentProfileHref(partial) {
    if (!partial || typeof partial !== "object") return null;
    const id = partial.id ?? partial.agent_id ?? partial.created_by_agent_id;
    const name = partial.name ?? partial.agent_name;
    const seg = id || name;
    if (seg == null || seg === "") return null;
    return `/agent/${encodeURIComponent(String(seg))}`;
  }
  const id = "agt_test123";
  assert.equal(agentProfileHref({ id, name: "Other" }), `/agent/${encodeURIComponent(id)}`);
  assert.equal(
    agentProfileHref({ created_by_agent_id: id, agent_name: "N" }),
    `/agent/${encodeURIComponent(id)}`
  );
  assert.equal(agentProfileHref({ agent_name: "OnlyName" }), "/agent/OnlyName");
  assert.equal(agentProfileHref({}), null);
}

function testMergePreservesSiblings() {
  const meta = {
    skills: ["trading"],
    integrations: {
      privy_wallet: { provider: "privy_wallet", wallet_address: "X", linked_at: "t1" },
    },
  };
  const { nextMetadata } = mergeIntegrationMetadata(meta, "moonpay", { connection_status: "connected" }, "t2");
  assert.deepEqual(nextMetadata.skills, ["trading"]);
  assert.equal(nextMetadata.integrations.privy_wallet.wallet_address, "X");
  assert.equal(nextMetadata.integrations.moonpay.connection_status, "connected");
  assert.equal(nextMetadata.integrations.moonpay.provider, "moonpay");
  assert.equal(nextMetadata.integrations.moonpay.linked_at, "t2");
}

async function testAgentsResolveByIdOrName() {
  const base = (process.env.BASE_URL || "").replace(/\/$/, "");
  const id = process.env.AGENT_ID || "";
  const name = process.env.AGENT_NAME || "";
  if (!base || !id || !name) return { skipped: true };

  const byId = await fetch(`${base}/agents/${encodeURIComponent(id)}`).then((r) => r.json());
  const byName = await fetch(`${base}/agents/${encodeURIComponent(name)}`).then((r) => r.json());
  assert.equal(byId.id, id);
  assert.equal(byName.id, id);
  return { skipped: false };
}

async function main() {
  testAgentProfileHrefPrefersId();
  testMergePreservesSiblings();
  const live = await testAgentsResolveByIdOrName();
  console.log("ok: agentProfileHref prefers agent id");
  console.log("ok: mergeIntegrationMetadata preserves siblings");
  console.log(live.skipped ? "ok: live agents route test skipped (set BASE_URL/AGENT_ID/AGENT_NAME)" : "ok: agents resolve by id or name");
}

main().catch((err) => {
  console.error("regression failed:", err);
  process.exit(1);
});

