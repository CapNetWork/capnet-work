const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");
const { parsePagination } = require("../middleware/pagination");
const { sanitizeBody, sanitizeUrl } = require("../middleware/sanitize");
const { generateClaimToken } = require("../lib/claim-tokens");
const onboardingRewardPayout = require("../services/onboarding-reward-payout");
const {
  generateAvatarUrl,
  generateBio,
  resolveAvatarUrl,
  normalizePerspective,
  normalizeStringArrays,
} = require("../lib/agent-payload-helpers");

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

/** Staging / older DBs: return directory rows with safe defaults when optional columns or joins are missing. */
function withAgentDirectoryDefaults(row) {
  return {
    ...row,
    trust_score: row.trust_score != null ? row.trust_score : 0,
    reputation_updated_at: row.reputation_updated_at ?? null,
    human_backed: Boolean(row.human_backed),
    verification_level: row.verification_level ?? null,
    wallet_connected: Boolean(row.wallet_connected),
  };
}

/**
 * Minimal agents directory query (core columns only).
 * Uses metadata::jsonb so TEXT/JSON/JSONB metadata columns all work on older DBs.
 */
async function listAgentsBare(pool, { domain, capability, limit, offset }) {
  let query = `SELECT ${AGENT_FIELDS} FROM agents`;
  const params = [];
  const conditions = [];
  if (domain) {
    conditions.push(`domain ILIKE $${params.length + 1}`);
    params.push(`%${domain}%`);
  }
  if (capability) {
    conditions.push(`(metadata::jsonb)->'capabilities' ? $${params.length + 1}`);
    params.push(capability);
  }
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }
  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  const result = await pool.query(query, params);
  return result.rows.map((row) =>
    withAgentDirectoryDefaults({
      ...row,
      trust_score: 0,
      reputation_updated_at: null,
      human_backed: false,
      verification_level: null,
      wallet_connected: false,
    })
  );
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

  const cleanName = name.trim();
  let finalAvatar;
  try {
    finalAvatar = resolveAvatarUrl(cleanName, avatar_url);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  let perspectiveTrim;
  try {
    perspectiveTrim = normalizePerspective(perspective);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  const norm = normalizeStringArrays(skills, goals, tasks);
  const skillsArr = Array.isArray(skills) ? norm.skillsArr : null;
  const goalsArr = Array.isArray(goals) ? norm.goalsArr : null;
  const tasksArr = Array.isArray(tasks) ? norm.tasksArr : null;
  const finalDescription =
    description ||
    generateBio({
      name: cleanName,
      domain,
      personality,
      skills: skillsArr,
      goals: goalsArr,
      tasks: tasksArr,
    });
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
    const agent = result.rows[0];
    let claim = {};
    try {
      claim = await generateClaimToken(agent.id);
    } catch (_) { /* claim token generation is best-effort */ }
    setImmediate(() => {
      onboardingRewardPayout
        .markProfileCompleted(agent.id, { ownerUserId: agent.owner_id || null })
        .catch((e) => console.warn("[onboarding-reward]", e.message));
    });
    res.status(201).json({ ...agent, ...claim });
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
  const ctx = { domain, capability, limit, offset };

  function appendFilters(baseParams, conditions) {
    const params = [...baseParams];
    if (domain) {
      conditions.push(`domain ILIKE $${params.length + 1}`);
      params.push(`%${domain}%`);
    }
    if (capability) {
      conditions.push(`(metadata::jsonb)->'capabilities' ? $${params.length + 1}`);
      params.push(capability);
    }
    return { params, conditions };
  }

  let lastErr = null;

  try {
    // 1) Full query (joins + trust + wallet flag)
    try {
      let query = `SELECT ${AGENT_FIELDS}, trust_score, reputation_updated_at,
      (wv.agent_id IS NOT NULL) AS human_backed,
      wv.verification_level,
      EXISTS (
        SELECT 1 FROM agent_wallets aw
        WHERE aw.agent_id = agents.id AND aw.chain_type = 'solana'
        LIMIT 1
      ) AS wallet_connected
      FROM agents
      LEFT JOIN agent_verifications wv ON wv.agent_id = agents.id AND wv.provider = 'world_id'`;
      const { params, conditions } = appendFilters([], []);
      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
      const result = await pool.query(query, params);
      res.json(result.rows);
      return;
    } catch (err) {
      lastErr = err;
      console.warn("[GET /agents] full query failed:", err.code || "", err.message);
    }

    // 2) No joins (optional tables / columns missing)
    try {
      let fallbackQuery = `SELECT ${AGENT_FIELDS}, trust_score, reputation_updated_at FROM agents`;
      const { params: fp, conditions: fc } = appendFilters([], []);
      if (fc.length > 0) {
        fallbackQuery += " WHERE " + fc.join(" AND ");
      }
      fallbackQuery += ` ORDER BY created_at DESC LIMIT $${fp.length + 1} OFFSET $${fp.length + 2}`;
      fp.push(limit, offset);
      const result = await pool.query(fallbackQuery, fp);
      res.json(
        result.rows.map((row) =>
          withAgentDirectoryDefaults({
            ...row,
            human_backed: false,
            verification_level: null,
            wallet_connected: false,
          })
        )
      );
      return;
    } catch (err) {
      lastErr = err;
      console.warn("[GET /agents] no-join query failed:", err.code || "", err.message);
    }

    // 3) Core columns only (+ safe metadata cast)
    try {
      res.json(await listAgentsBare(pool, ctx));
      return;
    } catch (err) {
      lastErr = err;
      console.warn("[GET /agents] bare query failed:", err.code || "", err.message);
    }

    // 4) Ignore capability filter if it is what breaks (invalid JSON, etc.)
    if (capability) {
      try {
        res.json(await listAgentsBare(pool, { ...ctx, capability: null }));
        return;
      } catch (err) {
        lastErr = err;
        console.warn("[GET /agents] bare without capability failed:", err.code || "", err.message);
      }
    }

    return next(lastErr || new Error("GET /agents failed"));
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
       FROM agents WHERE LOWER(name) = LOWER($1) OR id = $1`,
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
      "SELECT id FROM agents WHERE LOWER(name) = LOWER($1) OR id = $1",
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

router.get("/:agentRef/comments", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  try {
    const agentResult = await pool.query(
      "SELECT id FROM agents WHERE LOWER(name) = LOWER($1) OR id = $1",
      [req.params.agentRef]
    );
    if (agentResult.rows.length === 0) return res.status(404).json({ error: "Agent not found" });

    const result = await pool.query(
      `SELECT pc.id, pc.post_id, pc.agent_id, pc.parent_comment_id, pc.content, pc.created_at,
              p.content AS post_content, p.created_at AS post_created_at,
              a.id AS post_agent_id, a.name AS post_agent_name, a.avatar_url AS post_agent_avatar_url, a.domain AS post_agent_domain
       FROM post_comments pc
       JOIN posts p ON p.id = pc.post_id
       JOIN agents a ON a.id = p.agent_id
       WHERE pc.agent_id = $1
       ORDER BY pc.created_at DESC
       LIMIT $2 OFFSET $3`,
      [agentResult.rows[0].id, limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.get("/:name", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT ${AGENT_FIELDS}, trust_score, reputation_updated_at FROM agents WHERE LOWER(name) = LOWER($1) OR id = $1`,
      [req.params.name]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Agent not found" });
    }
    const agent = result.rows[0];

    const verif = await pool.query(
      `SELECT verification_level, verified_at FROM agent_verifications
       WHERE agent_id = $1 AND provider = 'world_id'`,
      [agent.id]
    );
    agent.human_backed = verif.rows.length > 0;
    agent.verification_level = verif.rows.length > 0 ? verif.rows[0].verification_level : null;

    const walletCheck = await pool.query(
      `SELECT id FROM agent_wallets WHERE agent_id = $1 AND chain_type = 'solana' LIMIT 1`,
      [agent.id]
    );
    agent.wallet_connected = walletCheck.rows.length > 0;

    const txStats = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'confirmed') AS successful_transactions,
         COUNT(*) FILTER (WHERE status = 'failed') AS failed_transactions,
         COUNT(*) AS total_transactions
       FROM agent_wallet_transactions
       WHERE agent_id = $1 AND tx_type = 'send_transaction'`,
      [agent.id]
    );

    const recentTx = await pool.query(
      `SELECT tx_hash, status, amount_lamports, created_at
       FROM agent_wallet_transactions
       WHERE agent_id = $1 AND tx_type = 'send_transaction'
       ORDER BY created_at DESC LIMIT 5`,
      [agent.id]
    );

    const earned = await pool.query(
      `SELECT COALESCE(SUM(amount::numeric), 0) AS total
       FROM agent_payment_events
       WHERE agent_id = $1 AND direction = 'inbound' AND status = 'settled'`,
      [agent.id]
    );
    const spent = await pool.query(
      `SELECT COALESCE(SUM(amount::numeric), 0) AS total
       FROM agent_payment_events
       WHERE agent_id = $1 AND direction = 'outbound' AND status = 'settled'`,
      [agent.id]
    );

    const stats = txStats.rows[0];
    agent.activity = {
      total_transactions: Number(stats.total_transactions),
      successful_transactions: Number(stats.successful_transactions),
      failed_transactions: Number(stats.failed_transactions),
      total_earned_usdc: earned.rows[0].total.toString(),
      total_paid_usdc: spent.rows[0].total.toString(),
      recent_executions: recentTx.rows.map((r) => ({
        tx_hash: r.tx_hash,
        status: r.status,
        amount_sol: r.amount_lamports ? (Number(r.amount_lamports) / 1e9).toString() : null,
        created_at: r.created_at,
      })),
    };

    res.json(agent);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// x402-gated paid signal endpoint
// ---------------------------------------------------------------------------

const { authenticateBySessionOrKey } = require("../middleware/auth");
const { x402Paywall } = require("../middleware/x402");

router.get("/:agentId/signals",
  authenticateBySessionOrKey,
  x402Paywall({ amount: "0.01", token: "USDC", freeForHumans: false, discountForHumans: 0.5 }),
  async (req, res, next) => {
    try {
      const agentId = req.params.agentId;
      const agent = await pool.query(
        `SELECT id, name, domain FROM agents WHERE id = $1`,
        [agentId]
      );
      if (agent.rows.length === 0) {
        return res.status(404).json({ error: "Agent not found" });
      }

      const recentPosts = await pool.query(
        `SELECT id, content, created_at FROM posts
         WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [agentId]
      );

      const recentTx = await pool.query(
        `SELECT tx_hash, status, amount_lamports, destination, created_at
         FROM agent_wallet_transactions
         WHERE agent_id = $1 AND tx_type = 'send_transaction' AND status = 'confirmed'
         ORDER BY created_at DESC LIMIT 5`,
        [agentId]
      );

      res.json({
        agent: { id: agent.rows[0].id, name: agent.rows[0].name, domain: agent.rows[0].domain },
        signals: {
          recent_posts: recentPosts.rows,
          recent_executions: recentTx.rows,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------

router.post("/me/claim-link", authenticateAgent, async (req, res, next) => {
  try {
    const claim = await generateClaimToken(req.agent.id);
    return res.json(claim);
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

router.get("/:id/track-record", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  try {
    const reputation = require("../services/agent-reputation");
    const agentRow = await pool.query(`SELECT id, name FROM agents WHERE id = $1`, [req.params.id]);
    if (agentRow.rows.length === 0) {
      return res.status(404).json({ error: "Agent not found" });
    }
    const intents = await pool.query(
      `SELECT i.id, i.contract_id, i.side, i.amount_lamports,
              i.quoted_price_usd, i.quoted_price_sol, i.quote_timestamp, i.quote_source,
              i.status, i.score_status, i.paper_pnl_bps, i.realized_pnl_bps, i.resolved_at,
              i.created_at,
              c.mint_address, c.symbol AS contract_symbol, c.name AS contract_name,
              awt.tx_hash, awt.status AS tx_status,
              (SELECT price_usd FROM contract_price_snapshots s
                 WHERE s.contract_id = i.contract_id
                 ORDER BY captured_at DESC LIMIT 1) AS current_price_usd
       FROM contract_transaction_intents i
       JOIN token_contracts c ON c.id = i.contract_id
       LEFT JOIN agent_wallet_transactions awt ON awt.id = i.wallet_tx_id
       WHERE i.created_by_agent_id = $1
       ORDER BY i.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );
    const [scored, summary] = await Promise.all([
      reputation.getScore(req.params.id),
      reputation.getTrackRecordSummary(req.params.id),
    ]);
    res.json({
      agent_id: req.params.id,
      agent_name: agentRow.rows[0].name,
      score: scored.score,
      components: scored.components,
      weights: scored.weights,
      summary,
      reputation: { score: scored.score, components: scored.components, weights: scored.weights },
      intents: intents.rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
