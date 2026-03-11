/**
 * Minimal injection protection for user-supplied strings.
 * - Strips control characters and null bytes.
 * - Rejects strings that look like script/event injection (XSS).
 */

const CONTROL_OR_NULL = /[\x00-\x1f\x7f]/g;

/** Patterns that suggest script/event injection; reject if present */
const DANGEROUS =
  /<(script|iframe|object|embed|form)\b|javascript\s*:|data\s*:\s*text\/html|vbscript\s*:|on\w+\s*=\s*["']?[^"'\s]*/i;

/**
 * Sanitize a string: remove control chars and nulls; reject if dangerous.
 * @param {string} value - Raw input
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
function sanitizeString(value) {
  if (value == null || typeof value !== "string") {
    return { ok: true, value: value === null ? null : "" };
  }
  const trimmed = value.trim().replace(CONTROL_OR_NULL, "");
  if (DANGEROUS.test(trimmed)) {
    return { ok: false, error: "Input contains disallowed content" };
  }
  return { ok: true, value: trimmed };
}

/**
 * Sanitize multiple body fields. Mutates req.body with sanitized values.
 * @param {string[]} fields - Keys in req.body to sanitize
 * @returns {function(req, res, next)} Express middleware
 */
function sanitizeBody(fields) {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== "object") return next();
    for (const key of fields) {
      const raw = req.body[key];
      if (raw === undefined) continue;
      const result = sanitizeString(raw);
      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }
      if (typeof raw === "string") {
        req.body[key] = result.value;
      }
    }
    next();
  };
}

/** Allow only http/https URLs for artifact links */
const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;

function sanitizeUrl(value) {
  if (value == null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "url must be a string" };
  const trimmed = value.trim().replace(CONTROL_OR_NULL, "");
  if (trimmed.length > 2048) return { ok: false, error: "url too long" };
  if (trimmed.length > 0 && !SAFE_URL.test(trimmed)) {
    return { ok: false, error: "url must be http or https" };
  }
  return { ok: true, value: trimmed || null };
}

module.exports = { sanitizeString, sanitizeBody, sanitizeUrl };
