const { Router } = require("express");
const { pool } = require("../db");
const { authenticateBySessionOrKey } = require("../middleware/auth");
const { sanitizeBody } = require("../middleware/sanitize");
const { parsePagination } = require("../middleware/pagination");

const router = Router();

function requireAgent(req, res) {
  if (!req.agent?.id) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.agent.id;
}

function cleanObject(input, maxKeys = 50) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(input)) {
    if (n >= maxKeys) break;
    if (typeof k !== "string" || k.length === 0 || k.length > 100) continue;
    if (v === undefined) continue;
    out[k] = v;
    n += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Autoposter configs
// ---------------------------------------------------------------------------

router.get("/configs", authenticateBySessionOrKey, async (req, res, next) => {
  const agentId = requireAgent(req, res);
  if (!agentId) return;
  try {
    const r = await pool.query(
      `SELECT id, agent_id, name, interests_json, cadence_json, tone, interaction_json, is_enabled, created_at, updated_at
       FROM autoposter_configs
       WHERE agent_id = $1
       ORDER BY created_at DESC`,
      [agentId]
    );
    res.json({ configs: r.rows });
  } catch (err) {
    next(err);
  }
});

router.get("/configs/:configId", authenticateBySessionOrKey, async (req, res, next) => {
  const agentId = requireAgent(req, res);
  if (!agentId) return;
  try {
    const r = await pool.query(
      `SELECT id, agent_id, name, interests_json, cadence_json, tone, interaction_json, is_enabled, created_at, updated_at
       FROM autoposter_configs
       WHERE agent_id = $1 AND id = $2
       LIMIT 1`,
      [agentId, req.params.configId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Config not found" });
    res.json({ config: r.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/configs",
  authenticateBySessionOrKey,
  sanitizeBody(["name", "tone"]),
  async (req, res, next) => {
    const agentId = requireAgent(req, res);
    if (!agentId) return;
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : null;
    const tone = typeof req.body?.tone === "string" ? req.body.tone.trim().slice(0, 40) : null;
    const interests = cleanObject(req.body?.interests_json || req.body?.interests || {});
    const cadence = cleanObject(req.body?.cadence_json || req.body?.cadence || {});
    const interaction = cleanObject(req.body?.interaction_json || req.body?.interaction || {});
    const isEnabled = req.body?.is_enabled == null ? true : Boolean(req.body.is_enabled);

    try {
      const r = await pool.query(
        `INSERT INTO autoposter_configs (agent_id, name, interests_json, cadence_json, tone, interaction_json, is_enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, agent_id, name, interests_json, cadence_json, tone, interaction_json, is_enabled, created_at, updated_at`,
        [agentId, name, interests, cadence, tone, interaction, isEnabled]
      );
      res.status(201).json({ config: r.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  "/configs/:configId",
  authenticateBySessionOrKey,
  sanitizeBody(["name", "tone"]),
  async (req, res, next) => {
    const agentId = requireAgent(req, res);
    if (!agentId) return;
    const configId = req.params.configId;
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : undefined;
    const tone = typeof req.body?.tone === "string" ? req.body.tone.trim().slice(0, 40) : undefined;
    const interests = req.body?.interests_json != null || req.body?.interests != null ? cleanObject(req.body?.interests_json || req.body?.interests || {}) : undefined;
    const cadence = req.body?.cadence_json != null || req.body?.cadence != null ? cleanObject(req.body?.cadence_json || req.body?.cadence || {}) : undefined;
    const interaction = req.body?.interaction_json != null || req.body?.interaction != null ? cleanObject(req.body?.interaction_json || req.body?.interaction || {}) : undefined;
    const isEnabled = req.body?.is_enabled !== undefined ? Boolean(req.body.is_enabled) : undefined;

    try {
      const current = await pool.query(
        `SELECT id, interests_json, cadence_json, interaction_json FROM autoposter_configs WHERE agent_id = $1 AND id = $2`,
        [agentId, configId]
      );
      if (current.rows.length === 0) return res.status(404).json({ error: "Config not found" });
      const cur = current.rows[0];

      const nextInterests = interests === undefined ? cur.interests_json : interests;
      const nextCadence = cadence === undefined ? cur.cadence_json : cadence;
      const nextInteraction = interaction === undefined ? cur.interaction_json : interaction;

      const r = await pool.query(
        `UPDATE autoposter_configs
         SET name = COALESCE($1, name),
             tone = COALESCE($2, tone),
             interests_json = $3,
             cadence_json = $4,
             interaction_json = $5,
             is_enabled = COALESCE($6, is_enabled),
             updated_at = now()
         WHERE agent_id = $7 AND id = $8
         RETURNING id, agent_id, name, interests_json, cadence_json, tone, interaction_json, is_enabled, created_at, updated_at`,
        [name ?? null, tone ?? null, nextInterests, nextCadence, nextInteraction, isEnabled ?? null, agentId, configId]
      );
      res.json({ config: r.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Runner heartbeat + status
// ---------------------------------------------------------------------------

router.post("/heartbeat", authenticateBySessionOrKey, sanitizeBody([]), async (req, res, next) => {
  const agentId = requireAgent(req, res);
  if (!agentId) return;
  const runnerId = typeof req.body?.runner_id === "string" ? req.body.runner_id.trim().slice(0, 80) : null;
  const configId = typeof req.body?.config_id === "string" ? req.body.config_id.trim().slice(0, 40) : null;
  const statusJson = cleanObject(req.body?.status || req.body?.status_json || {}, 100);

  try {
    const r = await pool.query(
      `INSERT INTO agent_runner_status (agent_id, config_id, runner_id, last_heartbeat, status_json)
       VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT (agent_id) DO UPDATE SET
         config_id = COALESCE(EXCLUDED.config_id, agent_runner_status.config_id),
         runner_id = COALESCE(EXCLUDED.runner_id, agent_runner_status.runner_id),
         last_heartbeat = now(),
         status_json = COALESCE(EXCLUDED.status_json, agent_runner_status.status_json),
         updated_at = now()
       RETURNING agent_id, config_id, runner_id, last_heartbeat, status_json`,
      [agentId, configId, runnerId, statusJson]
    );
    res.json({ ok: true, runner: r.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get("/status", authenticateBySessionOrKey, async (req, res, next) => {
  const agentId = requireAgent(req, res);
  if (!agentId) return;
  try {
    const r = await pool.query(
      `SELECT agent_id, config_id, runner_id, last_heartbeat, status_json
       FROM agent_runner_status
       WHERE agent_id = $1
       LIMIT 1`,
      [agentId]
    );
    res.json({ runner: r.rows[0] || null });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Command queue (MVP)
// ---------------------------------------------------------------------------

router.post("/commands", authenticateBySessionOrKey, sanitizeBody([]), async (req, res, next) => {
  const agentId = requireAgent(req, res);
  if (!agentId) return;
  const commandType = typeof req.body?.command_type === "string" ? req.body.command_type.trim().slice(0, 50) : "";
  const configId = typeof req.body?.config_id === "string" ? req.body.config_id.trim() : null;
  const payload = cleanObject(req.body?.payload_json || req.body?.payload || {}, 100);

  if (!commandType) return res.status(400).json({ error: "command_type is required" });

  try {
    // Basic safety: prevent runaway queued command spam.
    const queued = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM agent_commands
       WHERE agent_id = $1 AND status = 'queued'`,
      [agentId]
    );
    if ((queued.rows[0]?.c ?? 0) >= 50) {
      return res.status(429).json({ error: "Too many queued commands. Wait for the runner to process them." });
    }

    const r = await pool.query(
      `INSERT INTO agent_commands (agent_id, config_id, command_type, payload_json)
       VALUES ($1, $2, $3, $4)
       RETURNING id, agent_id, config_id, command_type, payload_json, status, created_at`,
      [agentId, configId, commandType, Object.keys(payload).length ? payload : null]
    );
    res.status(201).json({ command: r.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get("/commands", authenticateBySessionOrKey, async (req, res, next) => {
  const agentId = requireAgent(req, res);
  if (!agentId) return;
  const { limit, offset } = parsePagination(req.query);
  try {
    const r = await pool.query(
      `SELECT id, agent_id, config_id, command_type, payload_json, status, result_json, error_message,
              runner_id, created_at, started_at, completed_at
       FROM agent_commands
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [agentId, limit, offset]
    );
    res.json({ commands: r.rows });
  } catch (err) {
    next(err);
  }
});

router.post("/commands/poll", authenticateBySessionOrKey, sanitizeBody([]), async (req, res, next) => {
  const agentId = requireAgent(req, res);
  if (!agentId) return;
  const runnerId = typeof req.body?.runner_id === "string" ? req.body.runner_id.trim().slice(0, 80) : null;
  const max = Math.min(Math.max(parseInt(req.body?.limit, 10) || 5, 1), 25);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const q = await client.query(
      `SELECT id, config_id, command_type, payload_json, created_at
       FROM agent_commands
       WHERE agent_id = $1 AND status = 'queued'
       ORDER BY created_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [agentId, max]
    );
    const ids = q.rows.map((r) => r.id);
    if (ids.length > 0) {
      await client.query(
        `UPDATE agent_commands
         SET status = 'running', runner_id = $2, started_at = now()
         WHERE id = ANY($1::text[])`,
        [ids, runnerId]
      );
    }
    await client.query("COMMIT");
    res.json({ commands: q.rows });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    next(err);
  } finally {
    client.release();
  }
});

router.post("/commands/:id/complete", authenticateBySessionOrKey, sanitizeBody([]), async (req, res, next) => {
  const agentId = requireAgent(req, res);
  if (!agentId) return;
  const id = req.params.id;
  const statusRaw = typeof req.body?.status === "string" ? req.body.status.trim() : "completed";
  const status = statusRaw === "failed" ? "failed" : "completed";
  const result = cleanObject(req.body?.result_json || req.body?.result || {}, 200);
  const errorMessage = typeof req.body?.error_message === "string" ? req.body.error_message.slice(0, 2000) : null;
  try {
    const r = await pool.query(
      `UPDATE agent_commands
       SET status = $1,
           result_json = $2,
           error_message = $3,
           completed_at = now()
       WHERE agent_id = $4 AND id = $5
       RETURNING id, status, result_json, error_message, completed_at`,
      [status, Object.keys(result).length ? result : null, errorMessage, agentId, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Command not found" });
    res.json({ ok: true, command: r.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

