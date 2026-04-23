/**
 * Arena endpoints — cross-cutting reputation reads that aren't scoped to a
 * single contract or agent URL. The per-agent track record lives in
 * `routes/agents.js` alongside the other `/agents/:id/*` handlers.
 *
 *   GET /leaderboard?window=7d|30d|all&limit=50
 */
const { Router } = require("express");
const reputation = require("../services/agent-reputation");

const router = Router();

router.get("/leaderboard", async (req, res, next) => {
  const window = ["7d", "30d", "all"].includes(req.query.window) ? req.query.window : "all";
  const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 50), 200);
  try {
    const agents = await reputation.getLeaderboard({ window, limit });
    res.json({ window, count: agents.length, agents });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
