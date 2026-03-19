/**
 * Bankr HTTP integration — validate keys, resolve payout wallet, submit prompt-based payouts.
 * Configure BANKR_API_BASE_URL, or set BANKR_DEV_SKIP_VALIDATE=1 for local integration tests.
 */

async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { _raw: text };
  }
}

function baseUrl() {
  const b = process.env.BANKR_API_BASE_URL;
  if (!b) return null;
  return String(b).replace(/\/$/, "");
}

/**
 * Validate Bankr API key and return payout wallet address.
 * Expects JSON: { wallet_address } | { wallet } | { address } from Bankr when BANKR_VALIDATE_PATH is used.
 */
async function validateBankrAndResolveWallet(bankrApiKey) {
  if (process.env.BANKR_DEV_SKIP_VALIDATE === "1") {
    const mock = process.env.BANKR_DEV_MOCK_WALLET || "0x0000000000000000000000000000000000000000";
    return { wallet_address: mock };
  }

  const base = baseUrl();
  if (!base) {
    throw new Error("BANKR_API_BASE_URL is not set; cannot validate Bankr connection");
  }

  const path = process.env.BANKR_VALIDATE_PATH || "/v1/wallet";
  const res = await fetch(`${base}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${bankrApiKey}`,
      Accept: "application/json",
    },
  });

  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const msg = data.error || data.message || res.statusText;
    throw new Error(typeof msg === "string" ? msg : `Bankr validation failed (${res.status})`);
  }

  const wallet =
    data.wallet_address ||
    data.walletAddress ||
    data.wallet ||
    data.address ||
    (typeof data.default_wallet === "string" ? data.default_wallet : null);

  if (!wallet || typeof wallet !== "string") {
    throw new Error("Bankr response did not include a wallet address");
  }

  return { wallet_address: wallet.trim() };
}

/**
 * Submit a natural-language payout prompt to Bankr.
 * Returns { job_id, status } — shapes depend on Bankr API; we persist best-effort.
 */
async function submitPayoutPrompt({ bankrApiKey, amountUsdc, recipientWallet }) {
  const prompt = `Send ${amountUsdc} USDC on Base to ${recipientWallet} for Clickr posting reward`;

  if (process.env.BANKR_DEV_SKIP_VALIDATE === "1") {
    return { job_id: `dev_${Date.now()}`, status: "submitted", prompt };
  }

  const base = baseUrl();
  if (!base) throw new Error("BANKR_API_BASE_URL is not set");

  const path = process.env.BANKR_PAYOUT_PATH || "/v1/prompt";
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bankrApiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });

  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const msg = data.error || data.message || res.statusText;
    throw new Error(typeof msg === "string" ? msg : `Bankr payout failed (${res.status})`);
  }

  const jobId = data.job_id || data.id || data.jobId || null;
  const status = data.status || "submitted";
  return { job_id: jobId, status, prompt };
}

module.exports = { validateBankrAndResolveWallet, submitPayoutPrompt };
