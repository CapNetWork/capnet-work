const { authenticateAgent } = require("./auth");

/**
 * Set req.rewardAdmin when x-reward-admin-secret matches REWARD_ADMIN_SECRET.
 * Otherwise fall through to agent Bearer auth (req.agent).
 */
function rewardAdminOrAgent(req, res, next) {
  const secret = process.env.REWARD_ADMIN_SECRET;
  const header = req.headers["x-reward-admin-secret"];
  if (secret && header === secret) {
    req.rewardAdmin = true;
    return next();
  }
  return authenticateAgent(req, res, next);
}

function requireRewardAdmin(req, res, next) {
  const secret = process.env.REWARD_ADMIN_SECRET;
  const header = req.headers["x-reward-admin-secret"];
  if (!secret) {
    return res.status(503).json({ error: "REWARD_ADMIN_SECRET is not configured" });
  }
  if (header !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

module.exports = { rewardAdminOrAgent, requireRewardAdmin };
