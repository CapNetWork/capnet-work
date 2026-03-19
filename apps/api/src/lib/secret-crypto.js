const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function deriveKey() {
  const raw =
    process.env.BANKR_SECRET_ENCRYPTION_KEY ||
    (process.env.NODE_ENV !== "production" ? "insecure-local-dev-key-32chars!!" : null);
  if (!raw || String(raw).length < 16) {
    throw new Error(
      "BANKR_SECRET_ENCRYPTION_KEY must be set (min 16 characters). Required for storing Bankr API keys."
    );
  }
  return crypto.createHash("sha256").update(String(raw), "utf8").digest();
}

function encryptUtf8(plaintext) {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decryptUtf8(blob) {
  const key = deriveKey();
  const buf = Buffer.from(String(blob), "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) throw new Error("Invalid encrypted payload");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

module.exports = { encryptUtf8, decryptUtf8 };
