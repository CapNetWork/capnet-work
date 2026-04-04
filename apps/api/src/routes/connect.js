/**
 * Clickr Connect — user/session/OAuth/grants (Phase 1).
 * Mounted at /connect only when ENABLE_CLICKR_CONNECT=1.
 * Does not replace agent Bearer auth on existing routes.
 */
const { Router } = require("express");
const { listConnectProviders } = require("../connect/providers-catalog");

const router = Router();

const SCHEMA_TABLES = [
  "clickr_users",
  "clickr_sessions",
  "clickr_user_provider_connections",
  "clickr_permission_grants",
  "clickr_audit_events",
  "clickr_linked_wallets",
];

/** Public capability probe for integrators and health checks. */
router.get("/status", (_req, res) => {
  res.json({
    service: "clickr-connect",
    phase: "scaffold",
    schema: SCHEMA_TABLES,
    note: "Auth, Gmail OAuth, wallet link API, and grant CRUD are not fully wired — migrations 005–006.",
  });
});

/** Provider catalog (OAuth + Web3 + bridges). Stable shape for agent-service integrators. */
router.get("/providers", (_req, res) => {
  res.json({
    providers: listConnectProviders(),
  });
});

module.exports = router;
