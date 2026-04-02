const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");
const { parsePagination } = require("../middleware/pagination");
const { sanitizeBody, sanitizeUrl } = require("../middleware/sanitize");

const router = Router();

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many agent registrations, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const AGENT_FIELDS =
  "id, name, domain, personality, avatar_url, description, perspective, skills, goals, tasks, metadata, created_at";

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

function sanitizeAgentMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const out = {};
  const ALLOWED_CAPABILITIES = [
    "data_collection",
    "threat_analysis",
    "market_research",
    "trading",
    "code_generation",
    "research",
    "summarization",
    "other",
  ];
  if (Array.isArray(metadata.capabilities)) {
    out.capabilities = metadata.capabilities
      .slice(0, 20)
      .filter((c) => typeof c === "string" && ALLOWED_CAPABILITIES.includes(c));
  }
  if (Array.isArray(metadata.input_types)) {
    out.input_types = metadata.input_types.slice(0, 20).filter((t) => typeof t === "string" && t.length <= 100);
  }
  if (Array.isArray(metadata.output_types)) {
    out.output_types = metadata.output_types.slice(0, 20).filter((t) => typeof t === "string" && t.length <= 100);
  }
  if (typeof metadata.latency === "string" && metadata.latency.length <= 50) {
    out.latency = metadata.latency.trim();
  }
  if (typeof metadata.cost_per_call === "string" && metadata.cost_per_call.length <= 50) {
    out.cost_per_call = metadata.cost_per_call.trim();
  }
  if (typeof metadata.refresh_rate === "string" && metadata.refresh_rate.length <= 50) {
    out.refresh_rate = metadata.refresh_rate.trim();
  }
  if (Array.isArray(metadata.sources)) {
    out.sources = metadata.sources.slice(0, 20).filter((s) => typeof s === "string" && s.length <= 200);
  }
  return Object.keys(out).length > 0 ? out : null;
}

router.post("/", registrationLimiter, sanitizeBody(["name", "domain", "personality", "description", "perspective"]), async (req, res, next) => {
  const { name, domain, personality, description, perspective, avatar_url, skills, goals, tasks, metadata } = req.body;
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
  const agentMetadata = sanitizeAgentMetadata(metadata);

  try {
    const result = await pool.query(
      `INSERT INTO agents (name, domain, personality, description, perspective, avatar_url, skills, goals, tasks, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${AGENT_FIELDS}, api_key`,
      [
        cleanName,
        domain || null,
        personality || null,
        finalDescription,
        perspectiveTrim,
        finalAvatar,
        skillsArr,
        goalsArr,
        tasksArr,
        agentMetadata ? JSON.stringify(agentMetadata) : null,
      ]
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
  const { domain, capability } = req.query;
  const { limit, offset } = parsePagination(req.query);
  try {
    let query = `SELECT ${AGENT_FIELDS} FROM agents`;
    const params = [];
    const conditions = [];

    if (domain) {
      conditions.push(`domain ILIKE $${params.length + 1}`);
      params.push(`%${domain}%`);
    }
    if (capability) {
      conditions.push(`metadata->'capabilities' ? $${params.length + 1}`);
      params.push(capability);
    }
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
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

router.get("/:name/manifest", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, domain, description, skills, goals, tasks, metadata, created_at
       FROM agents WHERE LOWER(name) = LOWER($1)`,
      [req.params.name]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Agent not found" });
    const a = result.rows[0];
    const meta = a.metadata || {};
    const manifest = {
      name: a.name,
      id: a.id,
      domain: a.domain || null,
      description: a.description || null,
      inputs: meta.input_types || [],
      outputs: meta.output_types || [],
      capabilities: meta.capabilities || [],
      sources: meta.sources || [],
      refresh_rate: meta.refresh_rate || null,
      latency: meta.latency || null,
      cost_per_call: meta.cost_per_call || null,
      skills: a.skills || [],
      goals: a.goals || [],
      tasks: a.tasks || [],
    };
    res.json(manifest);
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
  const { domain, personality, description, perspective, avatar_url, skills, goals, tasks, metadata } = req.body;
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
  const agentMetadata = metadata !== undefined ? sanitizeAgentMetadata(metadata) : undefined;

  try {
    let metadataForDb;
    if (metadata !== undefined) {
      const current = await pool.query(`SELECT metadata FROM agents WHERE id = $1`, [req.agent.id]);
      const currentMetadata =
        current.rows[0]?.metadata && typeof current.rows[0].metadata === "object" ? current.rows[0].metadata : {};
      const currentIntegrations =
        currentMetadata.integrations && typeof currentMetadata.integrations === "object"
          ? currentMetadata.integrations
          : null;
      metadataForDb = {
        ...(agentMetadata || {}),
      };
      if (currentIntegrations) {
        // Keep integration state durable when profile metadata is updated.
        metadataForDb.integrations = currentIntegrations;
      }
    }

    const result = await pool.query(
      `UPDATE agents SET
         domain = COALESCE($1, domain),
         personality = COALESCE($2, personality),
         description = COALESCE($3, description),
         perspective = COALESCE($4, perspective),
         avatar_url = COALESCE($5, avatar_url),
         skills = COALESCE($6, skills),
         goals = COALESCE($7, goals),
         tasks = COALESCE($8, tasks),
         metadata = COALESCE($9, metadata)
       WHERE id = $10
       RETURNING ${AGENT_FIELDS}`,
      [
        domain,
        personality,
        description,
        perspectiveTrim,
        avatarUrlForDb,
        skillsArr,
        goalsArr,
        tasksArr,
        metadataForDb ? JSON.stringify(metadataForDb) : null,
        req.agent.id,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
