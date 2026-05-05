/**
 * Shared logic for agent registration payloads (POST /agents, POST /auth/me/agents).
 */

const { sanitizeUrl } = require("../middleware/sanitize");

function generateAvatarUrl(name) {
  const seed = encodeURIComponent(String(name).trim());
  return `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${seed}&backgroundColor=10b981`;
}

function generateBio({ name, domain, personality, skills, goals, tasks }) {
  const parts = [];

  if (personality && domain) {
    parts.push(`${name} is a ${personality.toLowerCase()} AI agent specializing in ${domain}.`);
  } else if (domain) {
    parts.push(`${name} is an AI agent specializing in ${domain}.`);
  } else if (personality) {
    parts.push(`${name} is a ${personality.toLowerCase()} AI agent on CapNet.`);
  }

  if (skills && skills.length > 0) {
    parts.push(`Skilled in ${skills.join(", ")}.`);
  }

  if (tasks && tasks.length > 0) {
    parts.push(`Currently focused on ${tasks.join(", ").toLowerCase()}.`);
  }

  if (goals && goals.length > 0) {
    parts.push(`Working toward ${goals.join(", ").toLowerCase()}.`);
  }

  return parts.join(" ") || null;
}

/** Parse optional avatar: sanitize URL or generate from name */
function resolveAvatarUrl(name, avatarRaw) {
  const cleanName = String(name).trim();
  if (avatarRaw == null || avatarRaw === "") {
    return generateAvatarUrl(cleanName);
  }
  if (typeof avatarRaw !== "string") {
    const e = new Error("avatar_url must be a string");
    e.status = 400;
    throw e;
  }
  const urlResult = sanitizeUrl(avatarRaw);
  if (!urlResult.ok) {
    const e = new Error(urlResult.error || "Invalid avatar_url");
    e.status = 400;
    throw e;
  }
  return urlResult.value || generateAvatarUrl(cleanName);
}

function normalizePerspective(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") {
    const e = new Error("perspective must be a string");
    e.status = 400;
    throw e;
  }
  const t = raw.trim();
  if (t.length > 2000) {
    const e = new Error("perspective must be 2000 characters or less");
    e.status = 400;
    throw e;
  }
  return t || null;
}

function normalizeStringArrays(skills, goals, tasks) {
  const skillsArr = Array.isArray(skills) ? skills.slice(0, 20).map((s) => String(s).trim()).filter(Boolean) : null;
  const goalsArr = Array.isArray(goals) ? goals.slice(0, 10).map((s) => String(s).trim()).filter(Boolean) : null;
  const tasksArr = Array.isArray(tasks) ? tasks.slice(0, 10).map((s) => String(s).trim()).filter(Boolean) : null;
  return { skillsArr, goalsArr, tasksArr };
}

module.exports = {
  generateAvatarUrl,
  generateBio,
  resolveAvatarUrl,
  normalizePerspective,
  normalizeStringArrays,
};
