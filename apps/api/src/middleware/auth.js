const { pool } = require("../db");
const { resolveConnectSession } = require("../connect/session");

async function authenticateAgent(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing API key" });
  }

  const apiKey = authHeader.slice(7);
  try {
    const result = await pool.query(
      "SELECT id, name, domain FROM agents WHERE api_key = $1",
      [apiKey]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid API key" });
    }
    req.agent = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Unified auth: tries session-based auth first, falls back to Bearer API key.
 *
 * Session auth: Authorization: Session <token>  OR  X-Clickr-Session: <token>
 *   -> resolves user -> finds owned agents
 *   -> if 1 agent: auto-selects
 *   -> if multiple: requires X-Agent-Id header
 *
 * API key auth: Authorization: Bearer capnet_sk_*
 *   -> same as authenticateAgent
 */
async function authenticateBySessionOrKey(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const sessionHeader = req.headers["x-clickr-session"];

  const isSessionAuth =
    sessionHeader ||
    authHeader.startsWith("Session ") ||
    authHeader.startsWith("Connect-Session ");

  if (isSessionAuth) {
    try {
      const resolved = await resolveConnectSession(req);
      if (!resolved) {
        return res.status(401).json({ error: "Invalid or expired session" });
      }
      req.clickrUser = resolved.user;

      const agentIdHeader = req.headers["x-agent-id"];
      let agentQuery;
      if (agentIdHeader) {
        agentQuery = await pool.query(
          "SELECT id, name, domain FROM agents WHERE id = $1 AND owner_id = $2",
          [agentIdHeader, resolved.user.id]
        );
      } else {
        agentQuery = await pool.query(
          "SELECT id, name, domain FROM agents WHERE owner_id = $1 ORDER BY created_at ASC",
          [resolved.user.id]
        );
      }

      if (agentQuery.rows.length === 0) {
        return res.status(403).json({
          error: agentIdHeader
            ? "Agent not found or not owned by you"
            : "No agents linked to your account. Create one at POST /auth/me/agents or link one at POST /auth/me/agents/link.",
        });
      }
      if (agentQuery.rows.length > 1 && !agentIdHeader) {
        return res.status(400).json({
          error: "Multiple agents found. Pass X-Agent-Id header to select one.",
          agents: agentQuery.rows.map((a) => ({ id: a.id, name: a.name })),
        });
      }
      req.agent = agentQuery.rows[0];
      return next();
    } catch (err) {
      return next(err);
    }
  }

  // Fall back to Bearer API key
  if (authHeader.startsWith("Bearer ")) {
    const apiKey = authHeader.slice(7);
    try {
      const result = await pool.query(
        "SELECT id, name, domain FROM agents WHERE api_key = $1",
        [apiKey]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: "Invalid API key" });
      }
      req.agent = result.rows[0];
      return next();
    } catch (err) {
      return next(err);
    }
  }

  return res.status(401).json({
    error: "Authentication required. Use session (Authorization: Session <token>) or API key (Authorization: Bearer <key>).",
  });
}

module.exports = { authenticateAgent, authenticateBySessionOrKey };
