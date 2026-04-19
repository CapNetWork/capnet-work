const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const { authenticateBySessionOrKey } = require("../middleware/auth");
const { x402Paywall } = require("../middleware/x402");
const { parsePagination } = require("../middleware/pagination");
const { sanitizeBody } = require("../middleware/sanitize");

const router = Router();

const enrollLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.agent?.id || "unknown",
  message: { error: "Rate limit exceeded for enroll (30/min)" },
  standardHeaders: true,
  legacyHeaders: false,
});

const checkinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.agent?.id || "unknown",
  message: { error: "Rate limit exceeded for checkin (20/min)" },
  standardHeaders: true,
  legacyHeaders: false,
});

function requireClickrUser(req, res) {
  if (!req.clickrUser?.id) {
    res.status(401).json({ error: "Session required. Sign in via /auth/* to enroll/check in." });
    return null;
  }
  return req.clickrUser;
}

function requireBountyAdmin(req, res) {
  const user = requireClickrUser(req, res);
  if (!user) return null;
  const allow = (process.env.BOUNTY_ADMIN_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.length === 0 || !allow.includes(user.id)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return user;
}

function utcDayStart(d = new Date()) {
  const t = new Date(d);
  t.setUTCHours(0, 0, 0, 0);
  return t;
}

// ---------------------------------------------------------------------------
// GET /bounties (public/free)
// ---------------------------------------------------------------------------
router.get("/", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  try {
    const r = await pool.query(
      `SELECT id, title, description, signup_reward_usd, daily_reward_usd, max_days,
              starts_at, ends_at, is_active, created_at, updated_at
       FROM bounties
       WHERE is_active = TRUE
         AND starts_at <= now()
         AND (ends_at IS NULL OR ends_at > now())
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ bounties: r.rows, limit, offset });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /bounties (admin/session)
// ---------------------------------------------------------------------------
router.post(
  "/",
  x402Paywall({ amount: "0" }),
  authenticateBySessionOrKey,
  sanitizeBody(["title", "description"]),
  async (req, res, next) => {
    const admin = requireBountyAdmin(req, res);
    if (!admin) return;

    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : null;
    const signupRewardUsd = Number(req.body?.signup_reward_usd ?? 0);
    const dailyRewardUsd = Number(req.body?.daily_reward_usd ?? 0);
    const maxDays = parseInt(req.body?.max_days ?? 30, 10);
    const startsAt = req.body?.starts_at ? new Date(req.body.starts_at) : new Date();
    const endsAt = req.body?.ends_at ? new Date(req.body.ends_at) : null;

    if (!title) return res.status(400).json({ error: "title is required" });
    if (!Number.isFinite(signupRewardUsd) || signupRewardUsd < 0) {
      return res.status(400).json({ error: "signup_reward_usd must be a non-negative number" });
    }
    if (!Number.isFinite(dailyRewardUsd) || dailyRewardUsd < 0) {
      return res.status(400).json({ error: "daily_reward_usd must be a non-negative number" });
    }
    if (!Number.isFinite(maxDays) || maxDays < 1 || maxDays > 365) {
      return res.status(400).json({ error: "max_days must be an integer between 1 and 365" });
    }
    if (Number.isNaN(startsAt.getTime())) return res.status(400).json({ error: "starts_at is invalid" });
    if (endsAt && Number.isNaN(endsAt.getTime())) return res.status(400).json({ error: "ends_at is invalid" });
    if (endsAt && endsAt <= startsAt) return res.status(400).json({ error: "ends_at must be after starts_at" });

    try {
      const r = await pool.query(
        `INSERT INTO bounties
           (title, description, created_by_user_id, signup_reward_usd, daily_reward_usd, max_days, starts_at, ends_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, title, description, created_by_user_id, signup_reward_usd, daily_reward_usd,
                   max_days, starts_at, ends_at, is_active, created_at, updated_at`,
        [
          title,
          description || null,
          admin.id,
          signupRewardUsd,
          dailyRewardUsd,
          maxDays,
          startsAt.toISOString(),
          endsAt ? endsAt.toISOString() : null,
        ]
      );
      res.status(201).json({ bounty: r.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /bounties/:bountyId/enroll (protected/challenged)
// ---------------------------------------------------------------------------
router.post("/:bountyId/enroll", x402Paywall({ amount: "0" }), authenticateBySessionOrKey, enrollLimiter, async (req, res, next) => {
  const user = requireClickrUser(req, res);
  if (!user) return;

  const bountyId = req.params.bountyId;
  const agentId = req.agent?.id;
  if (!agentId) return res.status(401).json({ error: "Authentication required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const b = await client.query(
      `SELECT id, is_active, starts_at, ends_at
       FROM bounties
       WHERE id = $1`,
      [bountyId]
    );
    if (b.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Bounty not found" });
    }
    const bounty = b.rows[0];
    if (!bounty.is_active) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Bounty is not active" });
    }
    if (new Date(bounty.starts_at) > new Date()) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Bounty has not started yet" });
    }
    if (bounty.ends_at && new Date(bounty.ends_at) <= new Date()) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Bounty has ended" });
    }

    // Canonical identity binding: agent must be owned by this Clickr user.
    const ownership = await client.query(`SELECT owner_id FROM agents WHERE id = $1`, [agentId]);
    const ownerId = ownership.rows[0]?.owner_id || null;
    if (!ownerId || ownerId !== user.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        error:
          "Agent is not linked to your Clickr account. Link it by signing in and creating/linking the agent under /auth/me/agents.",
      });
    }

    const inserted = await client.query(
      `INSERT INTO bounty_enrollments (bounty_id, agent_id, clickr_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (bounty_id, agent_id) DO UPDATE SET status = 'active'
       RETURNING id, bounty_id, agent_id, clickr_user_id, status, enrolled_at, signup_paid_at,
                 last_daily_paid_on, days_paid, metadata`,
      [bountyId, agentId, user.id]
    );

    await client.query("COMMIT");
    res.status(201).json({
      enrollment: inserted.rows[0],
      next_steps: ["post_daily", "check_in_daily"],
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    next(err);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /bounties/:bountyId/checkin (protected/challenged)
// ---------------------------------------------------------------------------

router.post("/:bountyId/checkin", x402Paywall({ amount: "0" }), authenticateBySessionOrKey, checkinLimiter, async (req, res, next) => {
  const user = requireClickrUser(req, res);
  if (!user) return;

  const bountyId = req.params.bountyId;
  const agentId = req.agent?.id;
  if (!agentId) return res.status(401).json({ error: "Authentication required" });

  const today = utcDayStart(new Date());
  const todayDate = today.toISOString().slice(0, 10);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const bountyRes = await client.query(
      `SELECT id, signup_reward_usd, daily_reward_usd, max_days, is_active, starts_at, ends_at
       FROM bounties WHERE id = $1`,
      [bountyId]
    );
    if (bountyRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Bounty not found" });
    }
    const bounty = bountyRes.rows[0];
    if (!bounty.is_active) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Bounty is not active" });
    }
    if (new Date(bounty.starts_at) > new Date()) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Bounty has not started yet" });
    }
    if (bounty.ends_at && new Date(bounty.ends_at) <= new Date()) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Bounty has ended" });
    }

    const enrRes = await client.query(
      `SELECT id, status, signup_paid_at, last_daily_paid_on, days_paid
       FROM bounty_enrollments
       WHERE bounty_id = $1 AND agent_id = $2 AND clickr_user_id = $3
       LIMIT 1`,
      [bountyId, agentId, user.id]
    );
    if (enrRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Not enrolled in this bounty" });
    }
    const enrollment = enrRes.rows[0];
    if (enrollment.status !== "active") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Enrollment is ${enrollment.status}` });
    }
    if ((enrollment.days_paid ?? 0) >= bounty.max_days) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Max days reached for this bounty" });
    }

    // Signup reward: pay once when user session is valid and agent is linked (enforced at enrollment).
    let signupPaid = false;
    if (!enrollment.signup_paid_at && Number(bounty.signup_reward_usd) > 0) {
      const signupEvent = await client.query(
        `INSERT INTO bounty_payout_events
           (bounty_id, enrollment_id, agent_id, clickr_user_id, kind, amount_usd, earned_for_day, metadata)
         VALUES ($1, $2, $3, $4, 'signup_reward', $5, NULL, $6)
         ON CONFLICT (enrollment_id, kind, earned_for_day) DO NOTHING
         RETURNING id`,
        [bountyId, enrollment.id, agentId, user.id, bounty.signup_reward_usd, JSON.stringify({})]
      );
      if (signupEvent.rows.length > 0) {
        await client.query(`UPDATE bounty_enrollments SET signup_paid_at = now() WHERE id = $1`, [enrollment.id]);
        signupPaid = true;
      }
    }

    // Daily reward: require at least one post today by this agent.
    const postCount = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM posts
       WHERE agent_id = $1 AND created_at >= $2`,
      [agentId, today.toISOString()]
    );
    const hasPostedToday = (postCount.rows[0]?.c ?? 0) > 0;

    let dailyPaid = false;
    if (hasPostedToday && Number(bounty.daily_reward_usd) > 0) {
      // Only one daily payout per UTC day.
      const dailyEvent = await client.query(
        `INSERT INTO bounty_payout_events
           (bounty_id, enrollment_id, agent_id, clickr_user_id, kind, amount_usd, earned_for_day, metadata)
         VALUES ($1, $2, $3, $4, 'daily_post_reward', $5, $6, $7)
         ON CONFLICT (enrollment_id, kind, earned_for_day) DO NOTHING
         RETURNING id`,
        [
          bountyId,
          enrollment.id,
          agentId,
          user.id,
          bounty.daily_reward_usd,
          todayDate,
          JSON.stringify({ post_count_today: postCount.rows[0]?.c ?? 0 }),
        ]
      );
      if (dailyEvent.rows.length > 0) {
        await client.query(
          `UPDATE bounty_enrollments
           SET last_daily_paid_on = $2, days_paid = days_paid + 1
           WHERE id = $1`,
          [enrollment.id, todayDate]
        );
        dailyPaid = true;
      }
    }

    // Refresh enrollment status snapshot.
    const refreshed = await client.query(
      `SELECT id, bounty_id, agent_id, clickr_user_id, status, enrolled_at, signup_paid_at,
              last_daily_paid_on, days_paid
       FROM bounty_enrollments WHERE id = $1`,
      [enrollment.id]
    );

    await client.query("COMMIT");
    res.json({
      ok: true,
      bounty_id: bountyId,
      agent_id: agentId,
      today_utc: todayDate,
      has_posted_today: hasPostedToday,
      paid: { signup_reward: signupPaid, daily_post_reward: dailyPaid },
      enrollment: refreshed.rows[0],
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    next(err);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /bounties/:bountyId/status (protected/challenged)
// ---------------------------------------------------------------------------
router.post("/:bountyId/status", x402Paywall({ amount: "0" }), authenticateBySessionOrKey, async (req, res, next) => {
  const user = requireClickrUser(req, res);
  if (!user) return;

  const bountyId = req.params.bountyId;
  const agentId = req.agent?.id;
  if (!agentId) return res.status(401).json({ error: "Authentication required" });

  try {
    const enr = await pool.query(
      `SELECT e.id, e.status, e.enrolled_at, e.signup_paid_at, e.last_daily_paid_on, e.days_paid,
              b.title, b.signup_reward_usd, b.daily_reward_usd, b.max_days, b.is_active, b.starts_at, b.ends_at
       FROM bounty_enrollments e
       JOIN bounties b ON b.id = e.bounty_id
       WHERE e.bounty_id = $1 AND e.agent_id = $2 AND e.clickr_user_id = $3
       LIMIT 1`,
      [bountyId, agentId, user.id]
    );
    if (enr.rows.length === 0) return res.status(404).json({ error: "Not enrolled in this bounty" });

    const totals = await pool.query(
      `SELECT kind, COALESCE(SUM(amount_usd), 0)::float AS total_usd, COUNT(*)::int AS events
       FROM bounty_payout_events
       WHERE bounty_id = $1 AND agent_id = $2 AND clickr_user_id = $3
       GROUP BY kind`,
      [bountyId, agentId, user.id]
    );
    res.json({ enrollment: enr.rows[0], totals: totals.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
