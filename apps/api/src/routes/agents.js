const { Router } = require("express");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");
const { parsePagination } = require("../middleware/pagination");
const { sanitizeBody, sanitizeUrl } = require("../middleware/sanitize");

const router = Router();

const AGENT_FIELDS = "id, name, domain, personality, avatar_url, description, perspective, skills, goals, tasks, created_at";

function generateAvatarUrl(name) {
  const seed = encodeURIComponent(name.trim());
  return `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${seed}&backgroundColor=10b981`;
}

function generateBio({ name, domain, personality, skills, goals, tasks }) {
  const parts = [];

  if (personality && domain) {
    parts.push(`${name} is a ${personality.toLowerCase()} AI agent specializing in ${domain}.`);
  } else if (domain) {
    parts.push(`${name} is an AI agent specializing in ${domain}.`);
  } else if (personality) {
    parts.push(`${name} is a ${personality.toLowerCase()} AI agent on CapNet.`);
  }

  if (skills && skills.length > 0) {
    parts.push(`Skilled in ${skills.join(", ")}.`);
  }

  if (tasks && tasks.length > 0) {
    parts.push(`Currently focused on ${tasks.join(", ").toLowerCase()}.`);
  }

  if (goals && goals.length > 0) {
    parts.push(`Working toward ${goals.join(", ").toLowerCase()}.`);
  }

  return parts.join(" ") || null;
}

router.post("/", sanitizeBody(["name", "domain", "personality", "description", "perspective"]), async (req, res, next) => {
  const { name, domain, personality, description, perspective, avatar_url, skills, goals, tasks } = req.body;
  if (!name || typeof name !== "string") return res.status(400).json({ error: "name is required" });
  if (name.length > 100) return res.status(400).json({ error: "name must be under 100 characters" });
  if (perspective != null && perspective.length > 2000) return res.status(400).json({ error: "perspective must be 2000 characters or less" });

  const cleanName = name.trim();
  let finalAvatar = avatar_url || generateAvatarUrl(cleanName);
  if (avatar_url) {
    const urlResult = sanitizeUrl(avatar_url);
    if (!urlResult.ok) return res.status(400).json({ error: urlResult.error });
    if (urlResult.value) finalAvatar = urlResult.value;
  }
  const finalDescription = description || generateBio({ name: cleanName, domain, personality, skills, goals, tasks });
  const skillsArr = Array.isArray(skills) ? skills.slice(0, 20) : null;
  const goalsArr = Array.isArray(goals) ? goals.slice(0, 10) : null;
  const tasksArr = Array.isArray(tasks) ? tasks.slice(0, 10) : null;
  const perspectiveTrim = typeof perspective === "string" ? perspective.trim() || null : null;

  try {
    const result = await pool.query(
      `INSERT INTO agents (name, domain, personality, description, perspective, avatar_url, skills, goals, tasks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${AGENT_FIELDS}, api_key`,
      [cleanName, domain || null, personality || null, finalDescription, perspectiveTrim, finalAvatar, skillsArr, goalsArr, tasksArr]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Agent name already taken" });
    }
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  const { domain } = req.query;
  const { limit, offset } = parsePagination(req.query);
  try {
    let query = `SELECT ${AGENT_FIELDS} FROM agents`;
    const params = [];

    if (domain) {
      query += " WHERE domain ILIKE $1";
      params.push(`%${domain}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.get("/me", authenticateAgent, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT ${AGENT_FIELDS} FROM agents WHERE id = $1`,
      [req.agent.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get("/:name/artifacts", async (req, res, next) => {
  try {
    const agentResult = await pool.query(
      "SELECT id FROM agents WHERE LOWER(name) = LOWER($1)",
      [req.params.name]
    );
    if (agentResult.rows.length === 0) return res.status(404).json({ error: "Agent not found" });
    const result = await pool.query(
      `SELECT id, title, description, url, artifact_type, created_at
       FROM agent_artifacts WHERE agent_id = $1 ORDER BY created_at DESC`,
      [agentResult.rows[0].id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.get("/:name", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT ${AGENT_FIELDS} FROM agents WHERE LOWER(name) = LOWER($1)`,
      [req.params.name]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Agent not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch("/me", authenticateAgent, sanitizeBody(["domain", "personality", "description", "perspective"]), async (req, res, next) => {
  const { domain, personality, description, perspective, avatar_url, skills, goals, tasks } = req.body;
  if (perspective != null && perspective.length > 2000) return res.status(400).json({ error: "perspective must be 2000 characters or less" });
  let avatarUrlForDb = undefined;
  if (avatar_url !== undefined) {
    const urlResult = sanitizeUrl(avatar_url);
    if (!urlResult.ok) return res.status(400).json({ error: urlResult.error });
    avatarUrlForDb = urlResult.value;
  }
  const skillsArr = Array.isArray(skills) ? skills.slice(0, 20) : undefined;
  const goalsArr = Array.isArray(goals) ? goals.slice(0, 10) : undefined;
  const tasksArr = Array.isArray(tasks) ? tasks.slice(0, 10) : undefined;
  const perspectiveTrim = typeof perspective === "string" ? perspective.trim() || null : undefined;

  try {
    const result = await pool.query(
      `UPDATE agents SET
         domain = COALESCE($1, domain),
         personality = COALESCE($2, personality),
         description = COALESCE($3, description),
         perspective = COALESCE($4, perspective),
         avatar_url = COALESCE($5, avatar_url),
         skills = COALESCE($6, skills),
         goals = COALESCE($7, goals),
         tasks = COALESCE($8, tasks)
       WHERE id = $9
       RETURNING ${AGENT_FIELDS}`,
      [domain, personality, description, perspectiveTrim, avatarUrlForDb, skillsArr, goalsArr, tasksArr, req.agent.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
