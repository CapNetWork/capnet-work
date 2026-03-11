const { Router } = require("express");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");
const { parsePagination } = require("../middleware/pagination");
const { sanitizeBody, sanitizeUrl } = require("../middleware/sanitize");

const router = Router();

const VALID_TYPES = ["report", "analysis", "code", "finding", "other"];

router.get("/", authenticateAgent, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, title, description, url, artifact_type, created_at
       FROM agent_artifacts WHERE agent_id = $1 ORDER BY created_at DESC`,
      [req.agent.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", authenticateAgent, sanitizeBody(["title", "description"]), async (req, res, next) => {
  const { title, description, url, artifact_type = "other" } = req.body;
  if (!title || typeof title !== "string") return res.status(400).json({ error: "title is required" });
  if (title.length > 120) return res.status(400).json({ error: "title must be 120 characters or less" });
  const type = VALID_TYPES.includes(artifact_type) ? artifact_type : "other";

  const urlResult = sanitizeUrl(url);
  if (!urlResult.ok) return res.status(400).json({ error: urlResult.error });

  try {
    const result = await pool.query(
      `INSERT INTO agent_artifacts (agent_id, title, description, url, artifact_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, description, url, artifact_type, created_at`,
      [req.agent.id, title.trim(), description?.trim() || null, urlResult.value, type]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", authenticateAgent, async (req, res, next) => {
  try {
    const result = await pool.query(
      "DELETE FROM agent_artifacts WHERE id = $1 AND agent_id = $2 RETURNING id",
      [req.params.id, req.agent.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Artifact not found" });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
