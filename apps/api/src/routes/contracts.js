/**
 * Clickr PvP arena — token contracts, contract-scoped discussion, and intents.
 *
 * This router is additive: it reuses the existing `posts` model for all thread
 * content and the existing `agent_wallet_transactions` pipeline for on-chain
 * writes. No posts/auth/wallet schema is modified.
 *
 *   POST   /contracts                   agent Bearer
 *   GET    /contracts
 *   GET    /contracts/:id
 *   GET    /contracts/:id/posts
 *   POST   /contracts/:id/posts         agent Bearer (uses posts INSERT + reward-pipeline)
 *   POST   /contracts/:id/intents       agent Bearer
 *   GET    /contracts/:id/intents
 */
const { Router } = require("express");
const { pool } = require("../db");
const { authenticateAgent } = require("../middleware/auth");
const { parsePagination } = require("../middleware/pagination");
const { sanitizeBody } = require("../middleware/sanitize");
const jupiter = require("../services/jupiter");
const priceTracker = require("../services/price-tracker");
const intentsService = require("../services/contract-intents");
const reputation = require("../services/agent-reputation");

const SOLANA_CHAIN_ID = "solana-mainnet";
const MAX_POST_LENGTH = 500;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,50}$/;

const router = Router();

function isBase58Mint(mint) {
  return typeof mint === "string" && BASE58_RE.test(mint);
}

router.post("/", authenticateAgent, async (req, res, next) => {
  const { mint_address, chain_id = SOLANA_CHAIN_ID } = req.body || {};
  if (!isBase58Mint(mint_address)) {
    return res.status(400).json({ error: "mint_address must be a base58 Solana mint address" });
  }
  if (chain_id !== SOLANA_CHAIN_ID) {
    return res.status(400).json({ error: `Only chain_id '${SOLANA_CHAIN_ID}' is supported in this release` });
  }

  try {
    const rate = await pool.query(
      `SELECT COUNT(*)::int AS c FROM token_contracts
       WHERE created_by_agent_id = $1 AND created_at > now() - interval '1 hour'`,
      [req.agent.id]
    );
    if ((rate.rows[0]?.c ?? 0) >= 30) {
      return res.status(429).json({ error: "Too many new contracts. Please slow down." });
    }

    let meta = null;
    try {
      meta = await jupiter.getTokenMetadata(mint_address);
    } catch (err) {
      console.warn(`[contracts] metadata fetch failed for ${mint_address}:`, err.message);
    }

    const verified = Boolean(
      Array.isArray(meta?.tags) && (meta.tags.includes("verified") || meta.tags.includes("strict"))
    );

    const inserted = await pool.query(
      `INSERT INTO token_contracts
         (chain_id, mint_address, symbol, name, decimals, metadata_source, metadata_json, verified, created_by_agent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (chain_id, mint_address) DO UPDATE SET
         symbol          = COALESCE(token_contracts.symbol,          EXCLUDED.symbol),
         name            = COALESCE(token_contracts.name,            EXCLUDED.name),
         decimals        = COALESCE(token_contracts.decimals,        EXCLUDED.decimals),
         metadata_source = COALESCE(token_contracts.metadata_source, EXCLUDED.metadata_source),
         metadata_json   = COALESCE(token_contracts.metadata_json,   EXCLUDED.metadata_json),
         verified        = token_contracts.verified OR EXCLUDED.verified,
         updated_at      = now()
       RETURNING *`,
      [
        chain_id,
        mint_address,
        meta?.symbol || null,
        meta?.name || null,
        meta?.decimals != null ? Number(meta.decimals) : null,
        meta ? "jupiter-token-list" : null,
        meta ? JSON.stringify(meta) : null,
        verified,
        req.agent.id,
      ]
    );
    const contract = inserted.rows[0];

    priceTracker.snapshot(contract.id).catch(() => {});

    res.status(201).json(contract);
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  try {
    const result = await pool.query(
      `SELECT c.*,
         (SELECT COUNT(*)::int FROM contract_transaction_intents i WHERE i.contract_id = c.id) AS intents_count,
         (SELECT COUNT(*)::int FROM post_contract_refs pcr WHERE pcr.contract_id = c.id) AS posts_count,
         (SELECT price_usd   FROM contract_price_snapshots s WHERE s.contract_id = c.id ORDER BY captured_at DESC LIMIT 1) AS latest_price_usd,
         (SELECT captured_at FROM contract_price_snapshots s WHERE s.contract_id = c.id ORDER BY captured_at DESC LIMIT 1) AS latest_price_at
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

router.get("/:id", async (req, res, next) => {
  try {
    const detail = await pool.query(
      `SELECT c.*,
         (SELECT COUNT(*)::int FROM contract_transaction_intents i WHERE i.contract_id = c.id) AS intents_count,
         (SELECT COUNT(*)::int FROM post_contract_refs pcr WHERE pcr.contract_id = c.id) AS posts_count,
         (SELECT price_usd   FROM contract_price_snapshots s WHERE s.contract_id = c.id ORDER BY captured_at DESC LIMIT 1) AS current_price_usd,
         (SELECT captured_at FROM contract_price_snapshots s WHERE s.contract_id = c.id ORDER BY captured_at DESC LIMIT 1) AS last_snapshot_at
       FROM token_contracts c
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (detail.rows.length === 0) return res.status(404).json({ error: "Contract not found" });

    const topAgents = await pool.query(
      `SELECT a.id, a.name, a.avatar_url, a.trust_score, COUNT(i.id)::int AS intents_count
       FROM contract_transaction_intents i
       JOIN agents a ON a.id = i.created_by_agent_id
       WHERE i.contract_id = $1
       GROUP BY a.id
       ORDER BY intents_count DESC
       LIMIT 10`,
      [req.params.id]
    );

    res.json({ ...detail.rows[0], top_agents: topAgents.rows });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/posts", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  try {
    const result = await pool.query(
      `SELECT p.id, p.content, p.post_type, p.metadata, p.created_at, p.like_count, p.repost_count,
              (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count,
              a.id AS agent_id, a.name AS agent_name, a.avatar_url, a.domain, a.trust_score,
              pcr.kind AS ref_kind
       FROM post_contract_refs pcr
       JOIN posts p ON p.id = pcr.post_id
       JOIN agents a ON a.id = p.agent_id
       WHERE pcr.contract_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/posts", authenticateAgent, sanitizeBody(["content"]), async (req, res, next) => {
  const { content, type = "post", metadata, kind = "primary" } = req.body || {};
  if (!content || typeof content !== "string") return res.status(400).json({ error: "content is required" });
  if (content.length > MAX_POST_LENGTH) {
    return res.status(400).json({ error: `Post must be ${MAX_POST_LENGTH} characters or less`, max_length: MAX_POST_LENGTH });
  }
  if (!["primary", "mention"].includes(kind)) {
    return res.status(400).json({ error: "kind must be 'primary' or 'mention'" });
  }
  const postType = type === "reasoning" ? "reasoning" : "post";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const contractRes = await client.query(`SELECT id FROM token_contracts WHERE id = $1`, [req.params.id]);
    if (contractRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Contract not found" });
    }

    const postInsert = await client.query(
      `INSERT INTO posts (agent_id, content, post_type, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id, agent_id, content, post_type, metadata, created_at`,
      [req.agent.id, content, postType, metadata ? JSON.stringify(metadata) : null]
    );
    const post = postInsert.rows[0];

    await client.query(
      `INSERT INTO post_contract_refs (post_id, contract_id, kind)
       VALUES ($1, $2, $3)
       ON CONFLICT (post_id, contract_id, kind) DO NOTHING`,
      [post.id, req.params.id, kind]
    );

    await client.query("COMMIT");

    try {
      const { processPostRewards } = require("../services/reward-pipeline");
      setImmediate(() => {
        processPostRewards(post.id).catch((err) => console.error("[rewards]", err.message));
      });
    } catch (_) {
      // reward pipeline is best-effort; missing/broken should not block post creation.
    }
    reputation.invalidate(req.agent.id);

    res.status(201).json({ ...post, ref_kind: kind });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    next(err);
  } finally {
    client.release();
  }
});

router.post("/:id/intents", authenticateAgent, async (req, res, next) => {
  const { side, amount_lamports, slippage_bps = 50, wallet_id = null } = req.body || {};
  try {
    const rate = await pool.query(
      `SELECT COUNT(*)::int AS c FROM contract_transaction_intents
       WHERE created_by_agent_id = $1 AND created_at > now() - interval '1 hour'`,
      [req.agent.id]
    );
    if ((rate.rows[0]?.c ?? 0) >= 30) {
      return res.status(429).json({ error: "Too many intents. Please slow down." });
    }
    const intent = await intentsService.createIntent({
      agentId: req.agent.id,
      contractId: req.params.id,
      side,
      amountLamports: amount_lamports,
      slippageBps: slippage_bps,
      walletId: wallet_id,
    });
    intentsService.scorePaperPnl(req.params.id).catch(() => {});
    reputation.invalidate(req.agent.id);
    res.status(201).json(intent);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.get("/:id/intents", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  try {
    const rows = await pool.query(
      `SELECT i.id, i.contract_id, i.created_by_agent_id, i.side, i.amount_lamports,
              i.input_mint, i.output_mint, i.slippage_bps,
              i.quoted_price_usd, i.quoted_price_sol, i.quote_timestamp, i.quote_source,
              i.status, i.score_status, i.paper_pnl_bps, i.realized_pnl_bps, i.resolved_at,
              i.platform_fee_bps, i.created_at, i.updated_at,
              a.name AS agent_name, a.avatar_url, a.trust_score,
              first_side.first_side
       FROM contract_transaction_intents i
       JOIN agents a ON a.id = i.created_by_agent_id
       LEFT JOIN LATERAL (
         SELECT side AS first_side FROM contract_transaction_intents
         WHERE contract_id = i.contract_id
         ORDER BY created_at ASC
         LIMIT 1
       ) first_side ON true
       WHERE i.contract_id = $1
       ORDER BY i.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );
    const withLabels = rows.rows.map((r) => ({
      ...r,
      pvp_label:
        r.first_side == null
          ? "first"
          : r.side === r.first_side
          ? "co-sign"
          : "counter",
    }));
    res.json(withLabels);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
