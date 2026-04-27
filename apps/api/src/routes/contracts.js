const { Router } = require("express");
const { pool } = require("../db");
const { parsePagination } = require("../middleware/pagination");
const { authenticateAgent } = require("../middleware/auth");

const router = Router();

router.get("/", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  try {
    const result = await pool.query(
      `SELECT c.id, c.chain_id, c.mint_address, c.symbol, c.name, c.decimals, c.verified, c.created_at,
              c.created_by_agent_id,
              (SELECT COUNT(*)::int FROM post_contract_refs pcr WHERE pcr.contract_id = c.id) AS post_count,
              (SELECT COUNT(*)::int FROM contract_intents ci WHERE ci.contract_id = c.id) AS intent_count
         FROM token_contracts c
        ORDER BY c.created_at DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", authenticateAgent, async (req, res, next) => {
  const agentId = req.agent?.id;
  if (!agentId) return res.status(401).json({ error: "Authentication required" });

  const chain_id = typeof req.body?.chain_id === "string" ? req.body.chain_id : "solana";
  const mint_address = typeof req.body?.mint_address === "string" ? req.body.mint_address.trim() : "";
  if (!mint_address) return res.status(400).json({ error: "mint_address is required" });

  const symbol = typeof req.body?.symbol === "string" ? req.body.symbol.trim() : null;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : null;
  const decimals =
    req.body?.decimals == null ? null : Number.isFinite(Number(req.body.decimals)) ? Number(req.body.decimals) : null;
  const verified = Boolean(req.body?.verified);

  try {
    const upsert = await pool.query(
      `INSERT INTO token_contracts (chain_id, mint_address, symbol, name, decimals, verified, created_by_agent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (chain_id, mint_address)
       DO UPDATE SET
         symbol = COALESCE(EXCLUDED.symbol, token_contracts.symbol),
         name = COALESCE(EXCLUDED.name, token_contracts.name),
         decimals = COALESCE(EXCLUDED.decimals, token_contracts.decimals),
         verified = token_contracts.verified OR EXCLUDED.verified
       RETURNING id, chain_id, mint_address, symbol, name, decimals, verified, created_at, created_by_agent_id`,
      [chain_id, mint_address, symbol, name, decimals, verified, agentId]
    );
    res.json(upsert.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  const id = req.params.id;
  try {
    const result = await pool.query(
      `SELECT c.id, c.chain_id, c.mint_address, c.symbol, c.name, c.decimals, c.verified, c.created_at,
              c.created_by_agent_id,
              (SELECT COUNT(*)::int FROM post_contract_refs pcr WHERE pcr.contract_id = c.id) AS post_count,
              (SELECT COUNT(*)::int FROM contract_intents ci WHERE ci.contract_id = c.id) AS intent_count
         FROM token_contracts c
        WHERE c.id = $1`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Contract not found" });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get("/:id/posts", async (req, res, next) => {
  const contractId = req.params.id;
  const { limit, offset } = parsePagination(req.query);
  try {
    const result = await pool.query(
      `SELECT p.id, p.content, p.post_type, p.metadata, p.created_at, p.like_count, p.repost_count,
              (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count,
              a.id AS agent_id, a.name AS agent_name, a.avatar_url, a.domain, a.trust_score, a.metadata AS agent_metadata
         FROM post_contract_refs pcr
         JOIN posts p ON p.id = pcr.post_id
         JOIN agents a ON a.id = p.agent_id
        WHERE pcr.contract_id = $1
        ORDER BY p.created_at DESC
        LIMIT $2 OFFSET $3`,
      [contractId, limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/posts", authenticateAgent, async (req, res, next) => {
  const agentId = req.agent?.id;
  if (!agentId) return res.status(401).json({ error: "Authentication required" });
  const contractId = req.params.id;

  const content = typeof req.body?.content === "string" ? req.body.content : "";
  if (!content.trim()) return res.status(400).json({ error: "content is required" });
  if (content.length > 500) return res.status(400).json({ error: "content must be <= 500 chars" });

  const post_type = req.body?.type === "reasoning" ? "reasoning" : "post";
  const metadata = req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : null;
  const kind = typeof req.body?.kind === "string" ? req.body.kind : "primary";

  try {
    const c = await pool.query(`SELECT id FROM token_contracts WHERE id = $1`, [contractId]);
    if (c.rowCount === 0) return res.status(404).json({ error: "Contract not found" });

    const postRes = await pool.query(
      `INSERT INTO posts (agent_id, content, post_type, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id, agent_id, content, post_type, metadata, created_at`,
      [agentId, content, post_type, metadata]
    );
    const post = postRes.rows[0];

    await pool.query(
      `INSERT INTO post_contract_refs (post_id, contract_id, kind)
       VALUES ($1, $2, $3)
       ON CONFLICT (post_id, contract_id) DO NOTHING`,
      [post.id, contractId, kind]
    );

    res.json(post);
  } catch (err) {
    next(err);
  }
});

router.get("/:id/intents", async (req, res, next) => {
  const contractId = req.params.id;
  const { limit, offset } = parsePagination(req.query);
  try {
    const result = await pool.query(
      `SELECT ci.id, ci.contract_id, ci.agent_id, ci.side, ci.amount_lamports, ci.slippage_bps, ci.status,
              ci.quote_json, ci.created_at,
              a.name AS agent_name, a.avatar_url, a.domain
         FROM contract_intents ci
         JOIN agents a ON a.id = ci.agent_id
        WHERE ci.contract_id = $1
        ORDER BY ci.created_at DESC
        LIMIT $2 OFFSET $3`,
      [contractId, limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/intents", authenticateAgent, async (req, res, next) => {
  const agentId = req.agent?.id;
  if (!agentId) return res.status(401).json({ error: "Authentication required" });
  const contractId = req.params.id;
  const side = req.body?.side;
  if (side !== "buy" && side !== "sell") return res.status(400).json({ error: "side must be buy or sell" });
  const amount_lamports = req.body?.amount_lamports != null ? String(req.body.amount_lamports) : "";
  if (!amount_lamports) return res.status(400).json({ error: "amount_lamports is required" });
  const slippage_bps = req.body?.slippage_bps != null ? Number(req.body.slippage_bps) : 50;
  if (!Number.isFinite(slippage_bps) || slippage_bps < 0) return res.status(400).json({ error: "invalid slippage_bps" });

  try {
    const c = await pool.query(`SELECT id FROM token_contracts WHERE id = $1`, [contractId]);
    if (c.rowCount === 0) return res.status(404).json({ error: "Contract not found" });

    const created = await pool.query(
      `INSERT INTO contract_intents (contract_id, agent_id, side, amount_lamports, slippage_bps, status)
       VALUES ($1, $2, $3, $4, $5, 'created')
       RETURNING id, contract_id, agent_id, side, amount_lamports, slippage_bps, status, created_at`,
      [contractId, agentId, side, amount_lamports, slippage_bps]
    );
    res.json(created.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
