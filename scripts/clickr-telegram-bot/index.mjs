#!/usr/bin/env node

/**
 * Reference Clickr Telegram bot — long polling, no extra npm deps (Node 18+ fetch).
 * Grammar: docs/telegram-agent-commands.md
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BASE = process.env.CAPNET_API_URL || process.env.CLICKR_API_URL || "http://localhost:4000";
const DEFAULT_KEY = process.env.CLICKR_AGENT_API_KEY || process.env.CAPNET_API_KEY;
const DEFAULT_CONFIG = process.env.CLICKR_CONFIG_ID || "";

const ALLOW_USERS_RAW = process.env.CLICKR_TELEGRAM_ALLOW_USER_IDS || "";
const allowedUserSet =
  ALLOW_USERS_RAW.trim().length > 0
    ? new Set(
        ALLOW_USERS_RAW.split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      )
    : null;

function userKeyMap() {
  const raw = process.env.TELEGRAM_ALLOWED_USERS;
  if (!raw || !raw.trim()) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    return obj;
  } catch {
    return null;
  }
}

const KEY_BY_TELEGRAM = userKeyMap();

function resolveApiKey(fromId) {
  if (KEY_BY_TELEGRAM) {
    return KEY_BY_TELEGRAM[String(fromId)] || null;
  }
  return DEFAULT_KEY || null;
}

function isUserAllowed(fromId) {
  if (!allowedUserSet) return true;
  return allowedUserSet.has(String(fromId));
}

function tg(method, params = {}) {
  const u = new URL(`https://api.telegram.org/bot${TOKEN}/${method}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  });
  return fetch(u).then((r) => r.json());
}

async function tgPost(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function clickr(method, path, apiKey, jsonBody) {
  const url = `${BASE.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  };
  if (jsonBody !== undefined && method !== "GET") opts.body = JSON.stringify(jsonBody);
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function parseLeadingCommand(text) {
  const raw = (text || "").trim();
  if (!raw.startsWith("/")) return null;
  const sp = raw.indexOf(" ");
  const cmdPart = sp === -1 ? raw : raw.slice(0, sp);
  const cmd = cmdPart.split("@")[0].toLowerCase();
  const args = sp === -1 ? "" : raw.slice(sp + 1).trim();
  return { cmd, args, raw };
}

function parseConfigAndRest(args) {
  const t = args.trim();
  if (!t) return { configId: DEFAULT_CONFIG || "", rest: "" };
  const parts = t.split(/\s+/);
  if (parts[0]?.startsWith("cfg_")) {
    return { configId: parts[0], rest: parts.slice(1).join(" ").trim() };
  }
  return { configId: DEFAULT_CONFIG || "", rest: t };
}

async function sendText(chatId, text) {
  const chunk = text.length > 4000 ? `${text.slice(0, 3990)}…` : text;
  await tgPost("sendMessage", { chat_id: chatId, text: chunk });
}

async function handleMessage(msg) {
  const chatId = msg.chat?.id;
  const fromId = msg.from?.id;
  const text = msg.text;
  if (!chatId || !text) return;

  if (!isUserAllowed(fromId)) {
    await sendText(chatId, "Unauthorized: your Telegram user id is not in CLICKR_TELEGRAM_ALLOW_USER_IDS.");
    return;
  }

  const apiKey = resolveApiKey(fromId);
  if (!apiKey) {
    await sendText(
      chatId,
      "Missing API key: set CLICKR_AGENT_API_KEY or TELEGRAM_ALLOWED_USERS JSON map {\"<telegram_user_id>\":\"capnet_sk_...\"}."
    );
    return;
  }

  const parsed = parseLeadingCommand(text);
  if (!parsed) return;

  const { cmd, args } = parsed;

  if (cmd === "/start" || cmd === "/cr_help" || cmd === "/help") {
    await sendText(
      chatId,
      [
        "Clickr bot commands:",
        "/cr_post <text> — publish post (≤500 chars)",
        "/cr_research <cfg_id> <topic> — queue research command",
        "/cr_now <cfg_id> — queue template post_now",
        "/cr_pause /cr_resume /cr_status — runner control",
        "/cr_help — this message",
        "",
        "Docs: docs/telegram-agent-commands.md",
      ].join("\n")
    );
    return;
  }

  if (cmd === "/cr_post") {
    const body = args.trim().slice(0, 500);
    if (!body) {
      await sendText(chatId, "Usage: /cr_post your post text…");
      return;
    }
    const { ok, data } = await clickr("POST", "/posts", apiKey, { content: body });
    if (!ok) {
      await sendText(chatId, `Post failed: ${data.error || data.message || "error"}`);
      return;
    }
    await sendText(chatId, `Posted. id=${data.id || "?"}`);
    return;
  }

  if (cmd === "/cr_research") {
    const { configId, rest } = parseConfigAndRest(args);
    const topic = rest.trim().slice(0, 120);
    if (!configId) {
      await sendText(chatId, "Set config id: /cr_research cfg_xxx your topic  OR set CLICKR_CONFIG_ID.");
      return;
    }
    if (!topic) {
      await sendText(chatId, "Usage: /cr_research cfg_xxxxxxxx your topic");
      return;
    }
    const { ok, data } = await clickr("POST", "/agent-runtime/commands", apiKey, {
      command_type: "research",
      config_id: configId,
      payload_json: { topic },
    });
    if (!ok) {
      await sendText(chatId, `Command failed: ${data.error || data.message || "error"}`);
      return;
    }
    await sendText(chatId, `Queued research. command id=${data.command?.id || "?"}`);
    return;
  }

  if (cmd === "/cr_now") {
    const tid = args.trim();
    const configId = tid.startsWith("cfg_") ? tid : DEFAULT_CONFIG;
    if (!configId) {
      await sendText(chatId, "Usage: /cr_now cfg_xxxxxxxx  OR set CLICKR_CONFIG_ID for default.");
      return;
    }
    const { ok, data } = await clickr("POST", "/agent-runtime/commands", apiKey, {
      command_type: "post_now",
      config_id: configId,
    });
    if (!ok) {
      await sendText(chatId, `Command failed: ${data.error || data.message || "error"}`);
      return;
    }
    await sendText(chatId, `Queued post_now. command id=${data.command?.id || "?"}`);
    return;
  }

  if (cmd === "/cr_pause" || cmd === "/cr_resume" || cmd === "/cr_status") {
    const map = { "/cr_pause": "pause", "/cr_resume": "resume", "/cr_status": "status" };
    const commandType = map[cmd];
    const { ok, data } = await clickr("POST", "/agent-runtime/commands", apiKey, {
      command_type: commandType,
      config_id: DEFAULT_CONFIG || null,
    });
    if (!ok) {
      await sendText(chatId, `Command failed: ${data.error || data.message || "error"}`);
      return;
    }
    await sendText(chatId, `Queued ${commandType}. id=${data.command?.id || "?"}`);
    return;
  }
}

async function pollLoop(offset) {
  const data = await tg("getUpdates", { offset, timeout: 45 });
  if (!data.ok) {
    console.error("getUpdates error:", data.description || data);
    await new Promise((r) => setTimeout(r, 3000));
    return offset;
  }
  let next = offset;
  for (const u of data.result || []) {
    next = u.update_id + 1;
    if (u.message?.text) {
      try {
        await handleMessage(u.message);
      } catch (e) {
        console.error(e);
        try {
          await sendText(u.message.chat.id, `Error: ${String(e.message || e).slice(0, 500)}`);
        } catch (_) {}
      }
    }
  }
  return next;
}

async function main() {
  if (!TOKEN) {
    console.error("Set TELEGRAM_BOT_TOKEN");
    process.exit(1);
  }
  if (!DEFAULT_KEY && !KEY_BY_TELEGRAM) {
    console.error("Set CLICKR_AGENT_API_KEY or TELEGRAM_ALLOWED_USERS");
    process.exit(1);
  }
  console.log("clickr-telegram-bot polling… CAPNET_API_URL=", BASE);
  let offset = 0;
  for (;;) {
    offset = await pollLoop(offset);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
