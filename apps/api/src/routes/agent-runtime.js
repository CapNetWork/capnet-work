const { Router } = require("express");
const { pool } = require("../db");
const { authenticateBySessionOrKey } = require("../middleware/auth");
const { sanitizeBody } = require("../middleware/sanitize");
const { parsePagination } = require("../middleware/pagination");
const analyzePosition = require("../services/analyze-position");

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
// Phase 1: single per-agent Runtime view
// ---------------------------------------------------------------------------

// UI cadence label <-> cadence_json mapping. "Off" only flips is_enabled
// and leaves cadence_json untouched so re-enabling restores the prior pace.
const CADENCE_BY_LABEL = {
  Slow: { preset: "low", max_posts_per_day: 1 },
  Normal: { preset: "medium", max_posts_per_day: 3 },
  Fast: { preset: "high", max_posts_per_day: 8 },
};

function cadenceLabelFromConfig(row) {
  if (!row) return "Off";
  if (row.is_enabled === false) return "Off";
  const preset = row.cadence_json?.preset;
  if (preset === "low") return "Slow";
  if (preset === "high") return "Fast";
  return "Normal";
}

function topicFromConfig(row) {
  const niche = row?.interests_json?.niche;
  return typeof niche === "string" ? niche : "";
}

// Selection rule: for any agent, the canonical autoposter row is the
// most recently updated, preferring is_enabled = true. Older rows are
// ignored by the UI but left in the table for back-compat.
async function selectCanonicalConfig(agentId, client = pool) {
  const r = await client.query(
    `SELECT id, agent_id, name, interests_json, cadence_json, tone, interaction_json, is_enabled, created_at, updated_at
     FROM autoposter_configs
     WHERE agent_id = $1
     ORDER BY is_enabled DESC, updated_at DESC
     LIMIT 1`,
    [agentId]
  );
  return r.rows[0] || null;
}

router.get("/agent", authenticateBySessionOrKey, async (req, res, next) => {
  const agentId = requireAgent(req, res);
  if (!agentId) return;
  try {
    const [config, runnerRes, lastPostRes] = await Promise.all([
      selectCanonicalConfig(agentId),
      pool.query(
        `SELECT runner_id, last_heartbeat, status_json
         FROM agent_runner_status
         WHERE agent_id = $1
         LIMIT 1`,
        [agentId]
      ),
      pool.query(
        `SELECT id, content, created_at
         FROM posts
         WHERE agent_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [agentId]
      ),
    ]);

    const runner = runnerRes.rows[0] || null;
    const lastPost = lastPostRes.rows[0] || null;
    const isEnabled = config ? Boolean(config.is_enabled) : false;

    // Status precedence: paused > live > offline.
    let runnerStatus = "offline";
    if (config && !isEnabled) {
      runnerStatus = "paused";
    } else if (runner?.last_heartbeat) {
      const ageMs = Date.now() - new Date(runner.last_heartbeat).getTime();
      if (ageMs >= 0 && ageMs <= 60_000) runnerStatus = "live";
    }

    res.json({
      agent: {
        config_id: config?.id || null,
        topic: topicFromConfig(config),
        cadence: cadenceLabelFromConfig(config),
        is_enabled: isEnabled,
        runner: {
          status: runnerStatus,
          last_heartbeat: runner?.last_heartbeat || null,
          runner_id: runner?.runner_id || null,
        },
        last_post: lastPost
          ? {
              id: lastPost.id,
              created_at: lastPost.created_at,
              url: `/post/${lastPost.id}`,
            }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch(
  "/agent",
  authenticateBySessionOrKey,
  sanitizeBody(["topic"]),
  async (req, res, next) => {
    const agentId = requireAgent(req, res);
    if (!agentId) return;

    const hasTopic = typeof req.body?.topic === "string";
    const topic = hasTopic ? req.body.topic.trim().slice(0, 80) : undefined;

    const cadenceLabel = typeof req.body?.cadence === "string" ? req.body.cadence : undefined;
    if (cadenceLabel !== undefined && !["Off", "Slow", "Normal", "Fast"].includes(cadenceLabel)) {
      return res.status(400).json({ error: "cadence must be one of: Off, Slow, Normal, Fast" });
    }

    const isEnabledExplicit =
      req.body?.is_enabled === true || req.body?.is_enabled === false ? Boolean(req.body.is_enabled) : undefined;

    try {
      const existing = await selectCanonicalConfig(agentId);

      const baseInterests =
        existing?.interests_json && typeof existing.interests_json === "object" && !Array.isArray(existing.interests_json)
          ? { ...existing.interests_json }
          : {};
      const baseCadence =
        existing?.cadence_json && typeof existing.cadence_json === "object" && !Array.isArray(existing.cadence_json)
          ? { ...existing.cadence_json }
          : {};

      let nextInterests = baseInterests;
      if (hasTopic) {
        nextInterests = { ...baseInterests };
        if (topic) nextInterests.niche = topic;
        else delete nextInterests.niche;
      }

      let nextCadence = baseCadence;
      let nextIsEnabled = existing ? Boolean(existing.is_enabled) : true;
      if (cadenceLabel === "Off") {
        nextIsEnabled = false;
      } else if (cadenceLabel && CADENCE_BY_LABEL[cadenceLabel]) {
        nextIsEnabled = true;
        nextCadence = { ...baseCadence, ...CADENCE_BY_LABEL[cadenceLabel] };
      }
      if (isEnabledExplicit !== undefined) nextIsEnabled = isEnabledExplicit;

      const newName = (() => {
        if (existing?.name) return existing.name;
        const label = (hasTopic && topic) || nextInterests.niche || "general";
        return `Autoposter — ${label}`.slice(0, 120);
      })();

      let row;
      if (existing) {
        const upd = await pool.query(
          `UPDATE autoposter_configs
           SET interests_json = $1,
               cadence_json = $2,
               is_enabled = $3,
               updated_at = now()
           WHERE agent_id = $4 AND id = $5
           RETURNING id, agent_id, name, interests_json, cadence_json, tone, interaction_json, is_enabled, created_at, updated_at`,
          [nextInterests, nextCadence, nextIsEnabled, agentId, existing.id]
        );
        row = upd.rows[0];
      } else {
        // First-time insert. cadence_json defaults to Normal if caller did not specify.
        if (Object.keys(nextCadence).length === 0) nextCadence = { ...CADENCE_BY_LABEL.Normal };
        const ins = await pool.query(
          `INSERT INTO autoposter_configs (agent_id, name, interests_json, cadence_json, is_enabled)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, agent_id, name, interests_json, cadence_json, tone, interaction_json, is_enabled, created_at, updated_at`,
          [agentId, newName, nextInterests, nextCadence, nextIsEnabled]
        );
        row = ins.rows[0];
      }

      res.json({
        agent: {
          config_id: row.id,
          topic: topicFromConfig(row),
          cadence: cadenceLabelFromConfig(row),
          is_enabled: Boolean(row.is_enabled),
        },
      });
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
// Signed prediction intent (sync MVP)
// ---------------------------------------------------------------------------

router.post("/markets/:marketId/analyze-and-position", authenticateBySessionOrKey, async (req, res, next) => {
  const agentId = requireAgent(req, res);
  if (!agentId) return;
  const marketId = req.params.marketId;
  const anchor = req.body?.anchor != null ? Boolean(req.body.anchor) : false;
  const authMethod = req.clickrUser ? "session" : "api_key";
  try {
    const out = await analyzePosition.analyzeAndPosition({ agentId, marketId, anchor, authMethod });
    res.json(out);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Command queue (MVP)
// ---------------------------------------------------------------------------

// Allowlist of command types accepted from clients. The DB CHECK constraint
// is broader (queued/running/completed/failed/cancelled status, plus older
// types like "research"/"status") but the public surface is narrowed here so
// the dashboard never has to know about queue plumbing.
const ALLOWED_COMMAND_TYPES = new Set(["post_now", "pause", "resume"]);

router.post("/commands", authenticateBySessionOrKey, sanitizeBody([]), async (req, res, next) => {
  const agentId = requireAgent(req, res);
  if (!agentId) return;
  const commandType = typeof req.body?.command_type === "string" ? req.body.command_type.trim().slice(0, 50) : "";
  const configId = typeof req.body?.config_id === "string" ? req.body.config_id.trim() : null;
  const payload = cleanObject(req.body?.payload_json || req.body?.payload || {}, 100);

  if (!commandType) return res.status(400).json({ error: "command_type is required" });
  if (!ALLOWED_COMMAND_TYPES.has(commandType)) {
    return res.status(400).json({ error: `command_type must be one of: ${Array.from(ALLOWED_COMMAND_TYPES).join(", ")}` });
  }

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

router.delete("/commands/:id", authenticateBySessionOrKey, async (req, res, next) => {
  const agentId = requireAgent(req, res);
  if (!agentId) return;
  const id = req.params.id;
  try {
    // Only queued rows can be cancelled — once a runner has picked it up
    // (running/completed/failed) the cancel is meaningless.
    const r = await pool.query(
      `UPDATE agent_commands
       SET status = 'cancelled', completed_at = now()
       WHERE agent_id = $1 AND id = $2 AND status = 'queued'
       RETURNING id, status, completed_at`,
      [agentId, id]
    );
    if (r.rows.length === 0) {
      return res.status(409).json({ error: "Command is not queued or does not exist" });
    }
    res.json({ ok: true, command: r.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

