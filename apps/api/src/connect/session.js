const crypto = require("crypto");
const { pool } = require("../db");

const SESSION_DAYS = Math.max(1, Math.min(365, Number(process.env.CLICKR_CONNECT_SESSION_DAYS || 30)));

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

function parseConnectSessionHeader(req) {
  const direct = req.headers["x-clickr-connect-session"];
  if (direct && typeof direct === "string") return direct.trim();
  const h = req.headers.authorization;
  if (!h || typeof h !== "string") return null;
  const m = /^Connect-Session\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

/**
 * @returns {Promise<{ user: object }|null>}
 */
async function resolveConnectSession(req) {
  const raw = parseConnectSessionHeader(req);
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  const r = await pool.query(
    `SELECT u.id, u.email, u.email_verified_at, u.created_at
     FROM clickr_sessions s
     JOIN clickr_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash]
  );
  if (r.rows.length === 0) return null;
  return { user: r.rows[0], rawToken: raw };
}

function requireConnectSession() {
  return async (req, res, next) => {
    const resolved = await resolveConnectSession(req);
    if (!resolved) {
      return res.status(401).json({
        error: "Connect session required",
        hint: "X-Clickr-Connect-Session: <token> or Authorization: Connect-Session <token> (from POST /connect/bootstrap/user)",
      });
    }
    req.clickrUser = resolved.user;
    next();
  };
}

async function createUserAndSession(client, { email = null } = {}) {
  const u = await client.query(
    `INSERT INTO clickr_users (email) VALUES ($1) RETURNING id, email, email_verified_at, created_at`,
    [email]
  );
  const user = u.rows[0];
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await client.query(
    `INSERT INTO clickr_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expiresAt]
  );
  return { user, session_token: rawToken, expires_at: expiresAt.toISOString() };
}

module.exports = {
  hashToken,
  parseConnectSessionHeader,
  resolveConnectSession,
  requireConnectSession,
  createUserAndSession,
  SESSION_DAYS,
};
