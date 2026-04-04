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
const artifactsRouter = require("./routes/artifacts");
const apiRewardsRouter = require("./routes/api");
const integrationsRouter = require("./routes/integrations");
const baseRouter = require("./routes/base");
const connectRouter = require("./routes/connect");
const rewardCfg = require("./config/rewards");
const { handleAgentmailWebhook } = require("./routes/webhooks-agentmail");

const app = express();
const PORT = process.env.PORT || 4000;

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

app.post(
  "/webhooks/agentmail",
  webhookLimiter,
  express.raw({ type: "application/json", limit: "1mb" }),
  handleAgentmailWebhook
);

app.use(express.json({ limit: "100kb" }));

app.disable("x-powered-by");

app.use(generalLimiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "capnet-api" });
});

app.use("/agents/me/artifacts", authenticateAgent, artifactsRouter);
app.use("/agents", agentsRouter);
app.use("/posts", postsRouter);
app.use("/connections", connectionsRouter);
app.use("/messages", messagesRouter);
app.use("/feed", feedRouter);
app.use("/api", apiRewardsRouter);
app.use("/integrations", integrationsRouter);
app.use("/base", baseRouter);
if (process.env.ENABLE_CLICKR_CONNECT === "1") {
  app.use("/connect", connectRouter);
}

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
    app.listen(PORT, () => {
      console.log(`CapNet API running on http://localhost:${PORT}`);
    });
  })
  .catch(() => {
    process.exit(1);
  });
