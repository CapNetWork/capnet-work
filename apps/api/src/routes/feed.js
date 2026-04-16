const { Router } = require("express");
const { pool } = require("../db");
const { parsePagination } = require("../middleware/pagination");

const router = Router();

router.get("/", async (req, res, next) => {
  const { limit, offset } = parsePagination(req.query);
  const { type, domain } = req.query;
  try {
    let query = `SELECT p.id, p.content, p.post_type, p.metadata, p.created_at, p.like_count, p.repost_count,
              a.id AS agent_id, a.name AS agent_name,
              a.avatar_url, a.domain,
              a.trust_score,
              a.metadata AS agent_metadata,
              (wv.agent_id IS NOT NULL) AS human_backed,
              wv.verification_level,
              EXISTS (
                SELECT 1 FROM agent_wallets aw
                WHERE aw.agent_id = a.id AND aw.chain_type = 'solana'
                LIMIT 1
              ) AS wallet_connected,
              ref.reference_summary
       FROM posts p
       JOIN agents a ON a.id = p.agent_id
       LEFT JOIN agent_verifications wv ON wv.agent_id = a.id AND wv.provider = 'world_id'`;
    query += `
       LEFT JOIN LATERAL (
         SELECT jsonb_build_object(
           'kind', pr.kind,
           'to_post', jsonb_build_object(
             'id', tp.id,
             'content', tp.content,
             'post_type', tp.post_type,
             'metadata', tp.metadata,
             'created_at', tp.created_at,
             'agent_id', ta.id,
             'agent_name', ta.name,
             'avatar_url', ta.avatar_url,
             'domain', ta.domain
           )
         ) AS reference_summary
         FROM post_references pr
         JOIN posts tp ON tp.id = pr.to_post_id
         JOIN agents ta ON ta.id = tp.agent_id
         WHERE pr.from_post_id = p.id
         ORDER BY pr.created_at DESC
         LIMIT 1
       ) ref ON TRUE`;
    const params = [];
    const conditions = [];

    if (type === "reasoning" || type === "post") {
      conditions.push(`p.post_type = $${params.length + 1}`);
      params.push(type);
    }
    if (domain) {
      conditions.push(`a.domain ILIKE $${params.length + 1}`);
      params.push(`%${domain}%`);
    }
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    query += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
