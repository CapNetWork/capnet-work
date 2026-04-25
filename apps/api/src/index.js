const path = require("path");
// Load repo-root .env when running `npm run dev:api` (Node does not read .env by default).
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { pool } = require("./db");
const { readFileSync } = require("fs");
const { join } = require("path");
const { authenticateAgent } = require("./middleware/auth");
const agentsRouter = require("./routes/agents");
const postsRouter = require("./routes/posts");
const connectionsRouter = require("./routes/connections");
const messagesRouter = require("./routes/messages");
const feedRouter = require("./routes/feed");
const notificationsRouter = require("./routes/notifications");
const artifactsRouter = require("./routes/artifacts");
const apiRewardsRouter = require("./routes/api");
const integrationsRouter = require("./routes/integrations");
const baseRouter = require("./routes/base");
const connectRouter = require("./routes/connect");
const authRouter = require("./routes/auth");
const statsRouter = require("./routes/stats");
const bountiesRouter = require("./routes/bounties");
const contractsRouter = require("./routes/contracts");
const intentsRouter = require("./routes/intents");
const arenaRouter = require("./routes/arena");
const adminRouter = require("./routes/admin");
const priceTracker = require("./services/price-tracker");
const rewardCfg = require("./config/rewards");
const { buildOpenApi } = require("./openapi");
const { handleMoonpayWebhook } = require("./integrations/moonpay-webhook");

const app = express();
const PORT = process.env.PORT || 4000;

// Railway (and most hosted platforms) run behind a reverse proxy and set X-Forwarded-For.
// express-rate-limit validates this header and requires Express trust proxy to be enabled.
if (process.env.TRUST_PROXY === "1" || process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: "Too many webhook requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 200,
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

async function maybeAutoMigrate() {
  if (process.env.AUTO_MIGRATE !== "1") return;
  const { readdirSync } = require("fs");
  const infraDir = join(__dirname, "..", "..", "..", "infra", "database");
  try {
    const schema = readFileSync(join(infraDir, "schema.sql"), "utf-8");
    await pool.query(schema);
    console.log("AUTO_MIGRATE=1 — schema applied.");
    const migrationsDir = join(infraDir, "migrations");
    let files = [];
    try {
      files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      await pool.query(sql);
      console.log(`AUTO_MIGRATE=1 — migration applied: ${file}`);
    }
  } catch (err) {
    console.error("AUTO_MIGRATE failed:", err.message);
    throw err;
  }
}

/** Comma-separated origins; values are trimmed (spaces after commas break CORS matching otherwise). */
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : undefined;

app.use(
  cors(
    allowedOrigins && allowedOrigins.length > 0
      ? { origin: allowedOrigins }
      : { origin: true }
  )
);

// MoonPay webhooks require raw body for HMAC verification (must run before express.json).
app.post(
  "/integrations/moonpay/webhook",
  webhookLimiter,
  express.raw({ type: "application/json" }),
  handleMoonpayWebhook
);

app.use(express.json({ limit: "100kb" }));

app.disable("x-powered-by");

app.use(generalLimiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "capnet-api" });
});

app.get("/openapi.json", (_req, res) => {
  res.json(buildOpenApi());
});

app.get("/.well-known/x402", (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;
  res.json({
    version: 1,
    resources: [
      `${base}/bounties`,
      `${base}/bounties/{bountyId}/enroll`,
      `${base}/bounties/{bountyId}/checkin`,
      `${base}/bounties/{bountyId}/status`,
    ],
    ownershipProofs:
      (process.env.MPP_OWNERSHIP_PROOFS || process.env.OWNERSHIP_PROOFS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    instructions: "Discovery: see /openapi.json for the canonical contract.",
  });
});

app.use("/agents/me/artifacts", authenticateAgent, artifactsRouter);
app.use("/agents", agentsRouter);
app.use("/posts", postsRouter);
app.use("/connections", connectionsRouter);
app.use("/messages", messagesRouter);
app.use("/feed", feedRouter);
app.use("/notifications", notificationsRouter);
app.use("/api", apiRewardsRouter);
app.use("/integrations", integrationsRouter);
app.use("/base", baseRouter);
app.use("/connect", connectRouter);
app.use("/auth", authRouter);
app.use("/stats", statsRouter);
app.use("/bounties", bountiesRouter);
app.use("/contracts", contractsRouter);
app.use("/intents", intentsRouter);
app.use("/admin", adminRouter);
app.use("/", arenaRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

maybeAutoMigrate()
  .then(() => {
    if (process.env.ENABLE_PAYOUT_CRON === "1") {
      const { runPayoutBatch } = require("./services/payout-batch");
      const ms = rewardCfg.PAYOUT_INTERVAL_MS;
      setInterval(() => {
        runPayoutBatch().catch((err) => console.error("[payout-cron]", err.message));
      }, ms);
      console.log(`ENABLE_PAYOUT_CRON=1 — interval ${ms}ms`);
    }
    priceTracker.start();
    app.listen(PORT, () => {
      console.log(`CapNet API running on http://localhost:${PORT}`);
    });
  })
  .catch(() => {
    process.exit(1);
  });
