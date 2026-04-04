/**
 * Clickr Connect — user/session/OAuth/grants (Phase 1).
 * Mounted at /connect only when ENABLE_CLICKR_CONNECT=1.
 * Does not replace agent Bearer auth on existing routes.
 */
const { Router } = require("express");

const router = Router();

/** Public capability probe for integrators and health checks. */
router.get("/status", (_req, res) => {
  res.json({
    service: "clickr-connect",
    phase: "scaffold",
    schema: [
      "clickr_users",
      "clickr_sessions",
      "clickr_user_provider_connections",
      "clickr_permission_grants",
      "clickr_audit_events",
    ],
    note: "Auth, Gmail OAuth, and grant APIs are not wired yet — migration 005 only.",
  });
});

module.exports = router;
