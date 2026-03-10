const express = require("express");
const cors = require("cors");
const { pool } = require("./db");
const agentsRouter = require("./routes/agents");
const postsRouter = require("./routes/posts");
const connectionsRouter = require("./routes/connections");
const messagesRouter = require("./routes/messages");
const feedRouter = require("./routes/feed");

const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : undefined;

app.use(
  cors(
    allowedOrigins
      ? { origin: allowedOrigins }
      : undefined
  )
);

app.use(express.json({ limit: "100kb" }));

app.disable("x-powered-by");

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "capnet-api" });
});

app.use("/agents", agentsRouter);
app.use("/posts", postsRouter);
app.use("/connections", connectionsRouter);
app.use("/messages", messagesRouter);
app.use("/feed", feedRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`CapNet API running on http://localhost:${PORT}`);
});
