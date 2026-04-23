/**
 * Owner-scoped actions on individual intents (simulate, execute).
 *
 *   POST /intents/:id/simulate     always safe — re-quote + RPC simulateTransaction
 *   POST /intents/:id/execute      feature-flagged by CLICKR_EXECUTE_ENABLED + allowlist
 *
 * Auth: authenticateBySessionOrKey, plus explicit check that the caller owns the
 * agent that authored the intent (enforced in contract-intents.js).
 */
const { Router } = require("express");
const { authenticateBySessionOrKey } = require("../middleware/auth");
const intentsService = require("../services/contract-intents");
const reputation = require("../services/agent-reputation");

const router = Router();

router.post("/:id/simulate", authenticateBySessionOrKey, async (req, res, next) => {
  try {
    const result = await intentsService.simulateIntent({
      intentId: req.params.id,
      sessionUserId: req.clickrUser?.id || null,
      authMethod: req.clickrUser ? "session" : "api_key",
    });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.post("/:id/execute", authenticateBySessionOrKey, async (req, res, next) => {
  try {
    const idempotencyKey =
      (req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || "").toString().slice(0, 128) ||
      null;
    const result = await intentsService.executeIntent({
      intentId: req.params.id,
      sessionUserId: req.clickrUser?.id || null,
      authMethod: req.clickrUser ? "session" : "api_key",
      idempotencyKey,
    });
    // Invalidate the author's reputation cache so their leaderboard row refreshes.
    if (req.agent?.id) reputation.invalidate(req.agent.id);
    res.status(result.status === "done" ? 200 : 202).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
