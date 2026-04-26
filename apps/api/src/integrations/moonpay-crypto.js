/**
 * MoonPay URL signing + webhook verification (partner docs: HMAC-SHA256).
 * @see https://dev.moonpay.com/v1.0/docs/ramps-sdk-url-signing
 * @see https://dev.moonpay.com/reference/reference-webhooks-signature
 */
const crypto = require("crypto");

/**
 * Build query string for signing: sorted keys, URLSearchParams order may vary;
 * MoonPay expects the same string you will append as signature to.
 * We use URLSearchParams built from sorted keys for stability.
 */
function sortedQueryString(params) {
  const keys = Object.keys(params).filter((k) => k !== "signature").sort();
  const pairs = keys.map((k) => {
    const v = params[k];
    if (v === undefined || v === null) return null;
    return `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`;
  }).filter(Boolean);
  return pairs.join("&");
}

function signQueryString(queryString, secretKey) {
  if (!secretKey) {
    const err = new Error("MOONPAY_SECRET_KEY is required to sign widget URLs");
    err.code = "MOONPAY_NOT_CONFIGURED";
    throw err;
  }
  // MoonPay signs the URL's query string as returned by URL.search, which includes the leading '?'.
  // See https://dev.moonpay.com/v1.0/docs/ramps-sdk-url-signing
  const payload = queryString && queryString.startsWith("?") ? queryString : `?${queryString || ""}`;
  return crypto.createHmac("sha256", secretKey).update(payload).digest("base64");
}

/**
 * @param {Record<string, string | number | boolean | undefined | null>} params - must include apiKey
 */
function buildSignedWidgetUrl(baseUrl, secretKey, params) {
  const cleanBase = String(baseUrl || "https://buy.moonpay.com").replace(/\/$/, "");
  const qs = sortedQueryString(params);
  const signature = signQueryString(qs, secretKey);
  const withSig = `${qs}&signature=${encodeURIComponent(signature)}`;
  return `${cleanBase}?${withSig}`;
}

/**
 * Verify MoonPay-Signature-V2: t=timestamp,s=hex_hmac
 */
function verifyWebhookSignature(rawBodyString, signatureHeader, webhookSecret) {
  if (!signatureHeader || !webhookSecret || rawBodyString === undefined) return false;
  const parts = String(signatureHeader).split(",");
  let t;
  let s;
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key === "t") t = val;
    if (key === "s") s = val;
  }
  if (!t || !s) return false;
  const signedPayload = `${t}.${rawBodyString}`;
  const expected = crypto.createHmac("sha256", webhookSecret).update(signedPayload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(s, "utf8"));
  } catch {
    return false;
  }
}

module.exports = {
  sortedQueryString,
  signQueryString,
  buildSignedWidgetUrl,
  verifyWebhookSignature,
};
