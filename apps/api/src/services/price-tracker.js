/**
 * Price tracker — captures `contract_price_snapshots` rows.
 *
 *   snapshot(contractId)  synchronous; best-effort Jupiter price fetch.
 *                         Returns the inserted snapshot or null on failure.
 *   snapshotActive()      snapshots every contract with activity in the last
 *                         PRICE_TRACKER_ACTIVE_WINDOW_HOURS.
 *   start() / stop()      tick-loop management; no-op unless PRICE_TRACKER_ENABLED=1.
 *
 * SOL's USD price is used as a baseline to derive price_sol for other mints.
 */
const { pool } = require("../db");
const jupiter = require("./jupiter");

const SOL_MINT = "So11111111111111111111111111111111111111112";
const INTERVAL_MS = Number(process.env.PRICE_TRACKER_INTERVAL_MS) || 90000;
const ACTIVE_WINDOW_HOURS = Number(process.env.PRICE_TRACKER_ACTIVE_WINDOW_HOURS) || 24;

let _timer = null;

async function snapshot(contractId) {
  const contractRes = await pool.query(
    `SELECT id, mint_address FROM token_contracts WHERE id = $1`,
    [contractId]
  );
  if (contractRes.rows.length === 0) return null;
  const { mint_address: mint } = contractRes.rows[0];

  let priceUsd = null;
  let priceSol = null;
  try {
    const mints = mint === SOL_MINT ? [SOL_MINT] : [mint, SOL_MINT];
    const resp = await jupiter.getPrice(mints);
    const data = resp?.data || {};
    const mintData = data[mint];
    const solData = data[SOL_MINT];
    priceUsd = mintData?.price != null ? Number(mintData.price) : null;
    if (mint === SOL_MINT) {
      priceSol = 1;
    } else if (priceUsd != null && solData?.price) {
      priceSol = Number(priceUsd) / Number(solData.price);
    }
  } catch (err) {
    console.warn(`[price-tracker] price fetch failed for ${mint}:`, err.message);
    return null;
  }

  if (priceUsd == null && priceSol == null) return null;

  const ins = await pool.query(
    `INSERT INTO contract_price_snapshots (contract_id, price_usd, price_sol, source)
     VALUES ($1, $2, $3, 'jupiter-price-v2')
     RETURNING id, price_usd, price_sol, captured_at`,
    [contractId, priceUsd, priceSol]
  );
  return ins.rows[0];
}

async function snapshotActive() {
  // Lazy-required to avoid a module-load cycle (contract-intents -> price-tracker).
  const contractIntents = require("./contract-intents");
  try {
    const rows = await pool.query(
      `SELECT DISTINCT c.id FROM token_contracts c
       WHERE EXISTS (
         SELECT 1 FROM contract_transaction_intents i
         WHERE i.contract_id = c.id
           AND i.created_at > now() - make_interval(hours => $1)
       )`,
      [ACTIVE_WINDOW_HOURS]
    );
    for (const row of rows.rows) {
      try {
        const snap = await snapshot(row.id);
        if (snap) {
          await contractIntents.scorePaperPnl(row.id).catch((err) =>
            console.warn(`[price-tracker] paper-pnl failed for ${row.id}:`, err.message)
          );
        }
      } catch (err) {
        console.warn(`[price-tracker] snapshot failed for ${row.id}:`, err.message);
      }
    }
  } catch (err) {
    console.warn(`[price-tracker] active sweep failed:`, err.message);
  }

  // Reconcile intents whose Privy-signed tx landed after the execute() sync window.
  try {
    const { resolved, failed } = await contractIntents.resolveSettledIntents();
    if (resolved || failed) {
      console.log(`[price-tracker] reconciled intents: resolved=${resolved} failed=${failed}`);
    }
  } catch (err) {
    console.warn(`[price-tracker] intent reconciliation failed:`, err.message);
  }
}

function start() {
  if (_timer) return;
  if (process.env.PRICE_TRACKER_ENABLED !== "1") return;
  _timer = setInterval(() => {
    snapshotActive().catch((err) => console.error("[price-tracker]", err.message));
  }, INTERVAL_MS);
  console.log(`[price-tracker] started (interval ${INTERVAL_MS}ms, window ${ACTIVE_WINDOW_HOURS}h)`);
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { snapshot, snapshotActive, start, stop, SOL_MINT };
