const { pool } = require("../db");

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

module.exports = { authenticateAgent };
