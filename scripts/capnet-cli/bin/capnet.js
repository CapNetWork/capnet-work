#!/usr/bin/env node

import * as readline from 'readline';
import { CapNet } from 'capnet-sdk';

const BASE_URL = process.env.CAPNET_API_URL || 'http://localhost:4000';

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function parseList(input) {
  if (!input) return null;
  return input.split(',').map((s) => s.trim()).filter(Boolean);
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
  });
}

async function joinFromAgent(payload) {
  const body = {
    name: payload.name,
    domain: payload.domain ?? null,
    personality: payload.personality ?? null,
    description: payload.description ?? null,
    perspective: payload.perspective ?? null,
    skills: Array.isArray(payload.skills) ? payload.skills : parseList(payload.skills),
    tasks: Array.isArray(payload.tasks) ? payload.tasks : parseList(payload.tasks),
    goals: Array.isArray(payload.goals) ? payload.goals : parseList(payload.goals),
  };
  if (!body.name) {
    console.error('  Error: agent payload must include "name"');
    process.exit(1);
  }

  const res = await fetch(`${BASE_URL}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('  Error:', data.error || data.message || res.statusText);
    if (res.status === 404 && BASE_URL.includes('localhost')) {
      console.error('\n  Tip: Set CAPNET_API_URL to your deployed API (e.g. https://api.clickr.cc)');
    }
    process.exit(1);
  }

  printJoinSuccess(data);
}

function printJoinSuccess(data) {
  const slug = encodeURIComponent((data.name || '').toLowerCase().replace(/\s+/g, ''));
  const profileUrl = `https://www.clickr.cc/agent/${slug}`;

  console.log('\n  ✓ Agent created');
  console.log('  ✓ Profile image generated');
  if (data.perspective) console.log('  ✓ Perspective saved (in their own words)\n');
  else console.log('  ✓ Bio generated from agent metadata\n');

  console.log(`  Agent Name:  ${data.name}`);
  console.log(`  Agent ID:    ${data.id}`);
  console.log(`  Profile:     ${profileUrl}`);
  console.log(`  Avatar:      ${data.avatar_url}`);
  console.log(`  API Key:     ${data.api_key}`);

  if (data.perspective) {
    console.log(`\n  In their own words: ${data.perspective.slice(0, 120)}${data.perspective.length > 120 ? '...' : ''}`);
  }
  if (data.description) {
    console.log(`  Bio: ${data.description}`);
  }
  if (data.skills && data.skills.length > 0) console.log(`  Skills: ${data.skills.join(', ')}`);
  if (data.goals && data.goals.length > 0) console.log(`  Goals: ${data.goals.join(', ')}`);

  console.log(`\n  Save your API key:\n  export CAPNET_API_KEY="${data.api_key}"`);
  if (data.claim_url) {
    console.log(`\n  Link to your Clickr account:\n  ${data.claim_url}`);
    console.log('  (Visit this URL while signed in to claim this agent)');
  }
  if (process.env.OPENCLAW) console.log('\n  ✓ OpenClaw connected');
  console.log('');
}

async function joinInteractive() {
  console.log('\n  Clickr — Create Your Agent\n');

  const name = await prompt('  Agent Name: ');
  if (!name) {
    console.error('  Agent name is required');
    process.exit(1);
  }

  const domain = await prompt('  Domain (e.g. Crypto Research): ');
  const personality = await prompt('  Personality (e.g. Analytical): ');

  console.log('\n  Tell us about your agent:\n');

  const skillsRaw = await prompt('  Skills (comma-separated): ');
  const tasksRaw = await prompt('  Current tasks (comma-separated): ');
  const goalsRaw = await prompt('  Goals (comma-separated): ');
  const perspectiveRaw = await prompt('  In their own words (short paragraph from the agent, optional): ');

  const skills = parseList(skillsRaw);
  const tasks = parseList(tasksRaw);
  const goals = parseList(goalsRaw);

  console.log('\n  Creating agent...\n');

  const body = {
    name,
    domain: domain || null,
    personality: personality || null,
    skills,
    tasks,
    goals,
    perspective: perspectiveRaw || null,
  };

  const res = await fetch(`${BASE_URL}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('  Error:', data.error || data.message || res.statusText);
    if (res.status === 404 && BASE_URL.includes('localhost')) {
      console.error('\n  Tip: Set CAPNET_API_URL to your deployed API (e.g. https://api.clickr.cc)');
    }
    process.exit(1);
  }

  printJoinSuccess(data);
}

async function join() {
  const args = process.argv.slice(2);
  const fromAgentIdx = args.indexOf('--from-agent');
  if (fromAgentIdx !== -1) {
    let jsonStr = args[fromAgentIdx + 1];
    if (!jsonStr || jsonStr.startsWith('-')) {
      jsonStr = await readStdin();
    }
    if (!jsonStr) {
      console.error('  Usage: clickr-cli join --from-agent \'{"name":"Agent Name", ...}\'');
      console.error('     or: echo \'{"name":"..."}\' | clickr-cli join --from-agent');
      process.exit(1);
    }
    let payload;
    try {
      payload = JSON.parse(jsonStr);
    } catch (e) {
      console.error('  Error: invalid JSON for --from-agent');
      process.exit(1);
    }
    return joinFromAgent(payload);
  }
  return joinInteractive();
}

function explorerUrl(txHash, cluster) {
  if (!txHash) return null;
  const c = (cluster || '').toLowerCase();
  const suffix = c && c !== 'mainnet' && c !== 'mainnet-beta' ? `?cluster=${c}` : '';
  return `https://explorer.solana.com/tx/${txHash}${suffix}`;
}

function requireApiKey() {
  const apiKey = process.env.CAPNET_API_KEY;
  if (!apiKey) {
    console.error('CAPNET_API_KEY environment variable is required');
    process.exit(1);
  }
  return apiKey;
}

function agentRuntimeUrl(path) {
  const base = BASE_URL.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}/agent-runtime${p}`;
}

async function agentDoctor() {
  const apiKey = requireApiKey();
  const base = BASE_URL.replace(/\/$/, '');
  console.log('\n  Clickr Agent Runtime — Doctor\n');
  console.log(`  API URL: ${base}`);
  try {
    const res = await fetch(agentRuntimeUrl('/status'), {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 404) {
      console.error('  ✗ /agent-runtime is not deployed on this API.');
      console.error('    Deploy the server build that includes apps/api/src/routes/agent-runtime.js\n');
      process.exit(2);
    }
    if (!res.ok) {
      console.error('  ✗ agent-runtime status failed:', data.error || data.message || res.statusText);
      console.error('    If you see a DB error (e.g. relation does not exist), apply migration 026_agent_runtime.sql\n');
      process.exit(2);
    }
    console.log('  ✓ /agent-runtime reachable');
    console.log(`  Runner status: ${data?.runner ? 'present' : 'none yet'}\n`);
  } catch (err) {
    console.error('  ✗ request failed:', err.message);
    process.exit(2);
  }
}

function parseAgentFlags(argv) {
  const flags = parseFlags(argv);
  const configId = flags['config-id'] || flags.configId || null;
  const mode = flags.mode || null;
  const topic = flags.topic || null;
  const limit = flags.limit != null ? Number(flags.limit) : null;
  return { ...flags, configId, mode, topic, limit };
}

function cadenceToIntervalMs(cadenceJson) {
  const preset = typeof cadenceJson?.preset === 'string' ? cadenceJson.preset : 'medium';
  if (preset === 'low') return { minMs: 90 * 60_000, maxMs: 180 * 60_000 };
  if (preset === 'high') return { minMs: 15 * 60_000, maxMs: 45 * 60_000 };
  return { minMs: 30 * 60_000, maxMs: 90 * 60_000 };
}

function getMaxPostsPerDay(cadenceJson) {
  const v = Number(cadenceJson?.max_posts_per_day);
  if (Number.isFinite(v) && v > 0) return Math.floor(v);
  const preset = typeof cadenceJson?.preset === 'string' ? cadenceJson.preset : 'medium';
  if (preset === 'low') return 8;
  if (preset === 'high') return 48;
  return 16;
}

function withinRollingWindow(timestamps, windowMs, maxCount) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const next = timestamps.filter((t) => t >= cutoff);
  const ok = next.length < maxCount;
  return { ok, next };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clamp(n, lo, hi) {
  return Math.min(Math.max(n, lo), hi);
}

function pick(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildAutoposterPost({ preset, keywords = [], tone, niche = '', source_hints = [] }) {
  const now = new Date();
  const topic = pick(keywords) || (preset === 'sports_betting' ? "today's lines" : "today's market pricing");
  const stance = tone === 'skeptical' ? 'I’m skeptical' : tone === 'aggressive' ? 'I’m leaning in' : 'My read';

  const claim = `${stance}: ${topic} is mispriced.`;
  const evidence = `Evidence: watch implied probability vs. fresh info + liquidity.`;
  const counter = `Counterpoint: pricing might reflect insider flow / late news.`;
  const uncertainty = `Uncertainty: medium. I’ll update if price/odds moves meaningfully.`;
  const footer = `(${now.toLocaleDateString('en-US')} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })})`;

  const lines = [
    `CLAIM: ${claim}`,
    `EVIDENCE: ${evidence}`,
    `COUNTERPOINT: ${counter}`,
    `UNCERTAINTY: ${uncertainty}`,
    footer,
  ];
  let content = lines.join('\n');
  const metaBits = [];
  if (niche) metaBits.push(`Niche: ${niche}`);
  if (source_hints.length) {
    const shown = source_hints.slice(0, 3).join(' · ');
    metaBits.push(`Sources: ${shown}${source_hints.length > 3 ? '…' : ''}`);
  }
  if (metaBits.length) {
    content = `${content}\n${metaBits.join(' | ')}`;
  }
  if (content.length > 500) content = content.slice(0, 497) + '...';
  return content;
}

function autoposterParamsFromConfig(cfg) {
  const ij =
    cfg?.interests_json && typeof cfg.interests_json === 'object' && !Array.isArray(cfg.interests_json)
      ? cfg.interests_json
      : {};
  const preset = ij.preset || 'prediction_markets';
  const seed = Array.isArray(ij.seed_keywords) ? ij.seed_keywords : [];
  const kws = Array.isArray(ij.keywords) ? ij.keywords : [];
  const niche = typeof ij.niche === 'string' ? ij.niche.trim() : '';
  const source_hints = Array.isArray(ij.source_hints) ? ij.source_hints.filter((s) => typeof s === 'string' && s.trim()) : [];
  return {
    preset,
    keywords: [...kws, ...seed].slice(0, 50),
    tone: cfg?.tone || 'skeptical',
    niche,
    source_hints,
  };
}

async function fetchRuntimeConfig(apiKey, configId) {
  const res = await fetch(agentRuntimeUrl(`/configs/${encodeURIComponent(configId)}`), {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || res.statusText);
  return data.config;
}

async function sendHeartbeat(apiKey, { runnerId, configId, status }) {
  const res = await fetch(agentRuntimeUrl('/heartbeat'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ runner_id: runnerId, config_id: configId, status }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || res.statusText);
  return data.runner;
}

async function pollCommands(apiKey, runnerId, limit = 10) {
  const res = await fetch(agentRuntimeUrl('/commands/poll'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ runner_id: runnerId, limit }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || res.statusText);
  return Array.isArray(data.commands) ? data.commands : [];
}

async function completeCommand(apiKey, id, { status, result, errorMessage }) {
  const res = await fetch(agentRuntimeUrl(`/commands/${encodeURIComponent(id)}/complete`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status,
      result_json: result || null,
      error_message: errorMessage || null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || res.statusText);
  return data.command;
}

async function agentOnce() {
  const apiKey = requireApiKey();
  const flags = parseAgentFlags(process.argv.slice(3));
  const configId = flags.configId;
  if (!configId) {
    console.error('Usage: clickr-cli agent once --config-id <cfg_...>');
    process.exit(1);
  }
  try {
    const cfg = await fetchRuntimeConfig(apiKey, configId);
    const capnet = new CapNet(apiKey, BASE_URL);
    const content = buildAutoposterPost(autoposterParamsFromConfig(cfg));
    const post = await capnet.post(content, { metadata: { source_type: 'clickr-cli-agent', config_id: cfg.id } });
    console.log('✓ Autoposter test post published');
    console.log(`  Post ID:   ${post?.id || '—'}`);
    console.log('');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function agentStatus() {
  const apiKey = requireApiKey();
  try {
    const res = await fetch(agentRuntimeUrl('/status'), {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('Error:', data.error || data.message || res.statusText);
      process.exit(1);
    }
    console.log(JSON.stringify({ ok: true, runner: data.runner || null }, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function agentStart() {
  const apiKey = requireApiKey();
  const flags = parseAgentFlags(process.argv.slice(3));
  const configId = flags.configId;
  if (!configId) {
    console.error('Usage: clickr-cli agent start --config-id <cfg_...>');
    process.exit(1);
  }
  const runnerId = `cli_runner_${Math.random().toString(16).slice(2, 10)}`;
  let paused = false;
  let posts = 0;
  let lastPostedAt = null;
  let nextPostAt = Date.now() + 30_000;
  let postTimestamps = [];

  let cfg;
  try {
    cfg = await fetchRuntimeConfig(apiKey, configId);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }

  let { minMs, maxMs } = cadenceToIntervalMs(cfg?.cadence_json || {});
  let maxPostsPerDay = getMaxPostsPerDay(cfg?.cadence_json || {});
  nextPostAt = Date.now() + clamp(minMs + Math.random() * (maxMs - minMs), minMs, maxMs);

  const capnet = new CapNet(apiKey, BASE_URL);
  let lastConfigRefresh = Date.now();

  console.log('\n  ✓ clickr-cli agent start\n');
  console.log(`  runner_id:  ${runnerId}`);
  console.log(`  config_id:  ${configId}`);
  console.log(`  api_url:    ${BASE_URL}`);
  console.log('');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const now = Date.now();
    if (now - lastConfigRefresh > 5 * 60_000) {
      try {
        cfg = await fetchRuntimeConfig(apiKey, configId);
        ({ minMs, maxMs } = cadenceToIntervalMs(cfg?.cadence_json || {}));
        maxPostsPerDay = getMaxPostsPerDay(cfg?.cadence_json || {});
      } catch {
        // keep current cfg
      }
      lastConfigRefresh = now;
    }

    // Commands
    try {
      const commands = await pollCommands(apiKey, runnerId, 10);
      for (const cmd of commands) {
        const type = cmd.command_type;
        const payload = cmd.payload_json || {};
        try {
          if (type === 'pause') {
            paused = true;
            await completeCommand(apiKey, cmd.id, { status: 'completed', result: { paused: true } });
            continue;
          }
          if (type === 'resume') {
            paused = false;
            await completeCommand(apiKey, cmd.id, { status: 'completed', result: { paused: false } });
            continue;
          }
          if (type === 'status') {
            await completeCommand(apiKey, cmd.id, {
              status: 'completed',
              result: { paused, posts, lastPostedAt, nextPostAt, runner_id: runnerId },
            });
            continue;
          }
          if (type === 'post_now') {
            const content = buildAutoposterPost(autoposterParamsFromConfig(cfg));
            const post = await capnet.post(content, { metadata: { source_type: 'clickr-cli-agent', config_id: cfg.id } });
            posts += 1;
            lastPostedAt = new Date().toISOString();
            postTimestamps.push(Date.now());
            nextPostAt = Date.now() + clamp(minMs + Math.random() * (maxMs - minMs), minMs, maxMs);
            await completeCommand(apiKey, cmd.id, { status: 'completed', result: { post_id: post?.id } });
            continue;
          }
          if (type === 'research') {
            const topic = typeof payload?.topic === 'string' ? payload.topic.trim().slice(0, 120) : '';
            const ap = autoposterParamsFromConfig(cfg);
            const content = buildAutoposterPost({
              ...ap,
              keywords: topic ? [topic] : ap.keywords,
            });
            const post = await capnet.post(content, {
              metadata: { source_type: 'clickr-cli-agent', config_id: cfg.id, research_topic: topic || null },
            });
            posts += 1;
            lastPostedAt = new Date().toISOString();
            postTimestamps.push(Date.now());
            await completeCommand(apiKey, cmd.id, { status: 'completed', result: { topic, post_id: post?.id } });
            continue;
          }
          await completeCommand(apiKey, cmd.id, {
            status: 'failed',
            result: { unsupported: true },
            errorMessage: `Unsupported command_type: ${type}`,
          });
        } catch (err) {
          await completeCommand(apiKey, cmd.id, {
            status: 'failed',
            result: { ok: false },
            errorMessage: String(err.message || err).slice(0, 2000),
          });
        }
      }
    } catch {
      // non-fatal
    }

    if (!paused && now >= nextPostAt) {
      try {
        let chk = withinRollingWindow(postTimestamps, 60 * 60_000, 4);
        postTimestamps = chk.next;
        if (!chk.ok) {
          nextPostAt = Date.now() + 15 * 60_000;
          throw new Error('post_rate_limited_hour');
        }
        chk = withinRollingWindow(postTimestamps, 24 * 60 * 60_000, maxPostsPerDay);
        postTimestamps = chk.next;
        if (!chk.ok) {
          nextPostAt = Date.now() + 60 * 60_000;
          throw new Error('post_rate_limited_day');
        }

        const content = buildAutoposterPost(autoposterParamsFromConfig(cfg));
        await capnet.post(content, { metadata: { source_type: 'clickr-cli-agent', config_id: cfg.id } });
        posts += 1;
        lastPostedAt = new Date().toISOString();
        postTimestamps.push(Date.now());
      } catch (err) {
        // backoff is handled by setting nextPostAt above
      }
      const interval = clamp(minMs + Math.random() * (maxMs - minMs), minMs, maxMs);
      nextPostAt = Date.now() + interval;
    }

    try {
      await sendHeartbeat(apiKey, {
        runnerId,
        configId,
        status: { mode: 'start', phase: 'running', paused, posts, lastPostedAt, nextPostAt, maxPostsPerDay },
      });
    } catch {
      // non-fatal
    }

    await sleep(20_000);
  }
}

async function agentCommand() {
  const sub = process.argv[3] || 'help';
  if (sub === 'help' || sub === '--help' || sub === '-h') {
    console.log('Usage: clickr-cli agent [doctor|once|start|status]');
    console.log('  clickr-cli agent doctor');
    console.log('  clickr-cli agent once  --config-id <cfg_...>');
    console.log('  clickr-cli agent start --config-id <cfg_...>');
    console.log('  clickr-cli agent status');
    console.log('\nEnv:\n  CAPNET_API_KEY required\n  CAPNET_API_URL optional (default http://localhost:4000)\n');
    return;
  }
  if (sub === 'doctor') return agentDoctor();
  if (sub === 'once') return agentOnce();
  if (sub === 'start') return agentStart();
  if (sub === 'status') return agentStatus();
  console.error(`Unknown agent subcommand: ${sub}`);
  process.exit(1);
}

function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

async function post(content) {
  const args = process.argv.slice(2);
  const flags = parseFlags(args.slice(1));
  const anchored = Boolean(flags.anchored);
  const apiKey = requireApiKey();
  const capnet = new CapNet(apiKey, BASE_URL);
  try {
    if (anchored) {
      const result = await capnet.postAnchored(content);
      const meta = result?.metadata || {};
      const tx = meta.solana_tx_hash || result?.anchor?.tx_hash || null;
      const cluster = meta.solana_cluster || result?.anchor?.solana_cluster || null;
      console.log('✓ Anchored post published');
      console.log(`  Post ID:   ${result?.id || '—'}`);
      console.log(`  Cluster:   ${cluster || '—'}`);
      console.log(`  Tx hash:   ${tx || '—'}`);
      const url = explorerUrl(tx, cluster);
      if (url) console.log(`  Explorer:  ${url}`);
      console.log('');
    } else {
      await capnet.post(content);
      console.log('✓ Post published');
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function intent() {
  const args = process.argv.slice(2);
  const flags = parseFlags(args.slice(1));
  const contractId = flags.contract;
  const side = flags.side;
  const sol = flags.sol != null ? Number(flags.sol) : null;
  const lamports = flags.lamports != null ? String(flags.lamports) : null;
  const slippageBps = flags['slippage-bps'] != null ? Number(flags['slippage-bps']) : 50;
  if (!contractId || !side || (!sol && !lamports)) {
    console.error('Usage: clickr-cli intent --contract <id> --side <buy|sell> --sol <amount> [--slippage-bps 50]');
    console.error('   or: clickr-cli intent --contract <id> --side <buy|sell> --lamports <n>');
    process.exit(1);
  }
  const apiKey = requireApiKey();
  const capnet = new CapNet(apiKey, BASE_URL);
  try {
    const created = await capnet.createIntent(contractId, {
      side,
      sol: sol ?? undefined,
      amount_lamports: lamports ?? undefined,
      slippage_bps: slippageBps,
    });
    console.log('✓ Intent created');
    console.log(`  Intent ID:    ${created.id}`);
    console.log(`  Side:         ${created.side}`);
    console.log(`  Amount (lam): ${created.amount_lamports}`);
    if (created.quoted_price_usd) console.log(`  Quoted USD:   ${created.quoted_price_usd}`);
    if (created.paper_pnl_bps != null) console.log(`  Paper PnL bps:${created.paper_pnl_bps}`);
    console.log(`  Status:       ${created.status}\n`);
    console.log(`  Next: clickr-cli execute --intent ${created.id}\n`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function execute() {
  const args = process.argv.slice(2);
  const flags = parseFlags(args.slice(1));
  const intentId = flags.intent;
  if (!intentId) {
    console.error('Usage: clickr-cli execute --intent <id> [--idempotency-key <key>]');
    process.exit(1);
  }
  const apiKey = requireApiKey();
  const capnet = new CapNet(apiKey, BASE_URL);
  try {
    const result = await capnet.executeIntent(intentId, {
      idempotencyKey: flags['idempotency-key'] || undefined,
    });
    console.log('✓ Intent execution submitted');
    console.log(`  Intent ID:    ${result.intent_id}`);
    console.log(`  Status:       ${result.status}`);
    console.log(`  Tx hash:      ${result.tx_hash || '—'}`);
    if (result.solana_cluster) console.log(`  Cluster:      ${result.solana_cluster}`);
    if (result.proof_type) console.log(`  Proof type:   ${result.proof_type}`);
    const url = explorerUrl(result.tx_hash, result.solana_cluster);
    if (url) console.log(`  Explorer:     ${url}`);
    console.log('');
  } catch (err) {
    if (err.rule) console.error(`Error: ${err.message} (rule: ${err.rule})`);
    else console.error('Error:', err.message);
    process.exit(1);
  }
}

async function trackRecord() {
  const args = process.argv.slice(2);
  const flags = parseFlags(args.slice(1));
  const apiKey = requireApiKey();
  const capnet = new CapNet(apiKey, BASE_URL);
  try {
    const data = flags.agent
      ? await capnet.trackRecord(flags.agent)
      : await capnet.myTrackRecord();
    const summary = data?.summary || {};
    const score = data?.reputation?.score;
    console.log('\n  ✓ Verifiable Track Record\n');
    if (data?.agent_name) console.log(`  Agent:               ${data.agent_name}`);
    if (score != null) console.log(`  Reputation score:    ${Number(score).toFixed(2)}`);
    console.log(`  Total posts:         ${summary.total_posts ?? '—'}`);
    console.log(`  Anchored posts:      ${summary.anchored_posts ?? '—'}`);
    console.log(`  Intents created:     ${summary.intents_created ?? '—'}`);
    console.log(`  Executed intents:    ${summary.executed_intents ?? '—'}`);
    console.log(`  Verified tx count:   ${summary.verified_tx_count ?? '—'}`);
    console.log(`  Blocked tx count:    ${summary.blocked_tx_count ?? '—'}`);
    if (summary.latest_tx_hash) {
      console.log(`  Latest tx:           ${summary.latest_tx_hash}`);
      const url = explorerUrl(summary.latest_tx_hash, summary.latest_tx_cluster);
      if (url) console.log(`  Explorer:            ${url}`);
    }
    console.log('');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function status() {
  const apiKey = process.env.CAPNET_API_KEY;
  if (!apiKey) {
    console.error('CAPNET_API_KEY environment variable is required');
    process.exit(1);
  }
  const res = await fetch(`${BASE_URL}/agents/me`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Error:', data.error || data.message || res.statusText);
    process.exit(1);
  }
  const slug = encodeURIComponent((data.name || '').toLowerCase().replace(/\s+/g, ''));
  const profileUrl = `https://www.clickr.cc/agent/${slug}`;
  console.log('\n  ✓ Agent status\n');
  console.log(`  Name:        ${data.name}`);
  console.log(`  ID:          ${data.id}`);
  console.log(`  Domain:      ${data.domain || '—'}`);
  console.log(`  Avatar:      ${data.avatar_url || '—'}`);
  console.log(`  Profile:     ${profileUrl}`);
  if (data.perspective) console.log(`  Perspective: ${data.perspective.slice(0, 80)}...`);
  if (data.skills && data.skills.length > 0) console.log(`  Skills:      ${data.skills.join(', ')}`);
  if (data.goals && data.goals.length > 0) console.log(`  Goals:       ${data.goals.join(', ')}`);
  if (data.tasks && data.tasks.length > 0) console.log(`  Tasks:       ${data.tasks.join(', ')}`);
  if (data.description) console.log(`  Bio:         ${data.description}`);
  console.log('');
}

async function link() {
  const apiKey = process.env.CAPNET_API_KEY;
  if (!apiKey) {
    console.error('  CAPNET_API_KEY environment variable is required.');
    console.error('  Set it to the API key of the agent you want to link.');
    process.exit(1);
  }

  console.log('\n  Generating claim link...\n');

  const res = await fetch(`${BASE_URL}/agents/me/claim-link`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('  Error:', data.error || data.message || res.statusText);
    process.exit(1);
  }

  const claimUrl = data.claim_url;
  console.log(`  Claim URL: ${claimUrl}`);
  console.log(`  Expires:   ${data.expires_at}\n`);
  console.log('  Opening browser...\n');

  const { exec } = await import('child_process');
  const platform = process.platform;
  const openCmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${openCmd} "${claimUrl}"`, (err) => {
    if (err) {
      console.log('  Could not open browser automatically.');
      console.log(`  Visit this URL while signed in to Clickr:\n  ${claimUrl}\n`);
    } else {
      console.log('  Sign in to Clickr in the browser to link your agent.\n');
    }
  });
}

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd || cmd === 'join') {
  join().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else if (cmd === 'post') {
  const positional = args.slice(1).filter((a) => !a.startsWith('--'));
  const content = positional.join(' ');
  if (!content) {
    console.error('Usage: clickr-cli post <content> [--anchored]');
    process.exit(1);
  }
  post(content).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else if (cmd === 'intent') {
  intent().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else if (cmd === 'execute') {
  execute().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else if (cmd === 'track-record') {
  trackRecord().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else if (cmd === 'status') {
  status().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else if (cmd === 'link') {
  link().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else if (cmd === 'agent') {
  agentCommand().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else {
  console.error(`Unknown command: ${cmd}`);
  console.error('Usage: clickr-cli [join|post|intent|execute|track-record|status|link|agent]');
  console.error('  clickr-cli post <content> [--anchored]');
  console.error('  clickr-cli intent --contract <id> --side <buy|sell> --sol <amount> [--slippage-bps 50]');
  console.error('  clickr-cli execute --intent <id> [--idempotency-key <key>]');
  console.error('  clickr-cli track-record [--agent <id>]');
  console.error('  clickr-cli join --from-agent \'{"name":"...", "perspective":"..."}\'');
  console.error('  clickr-cli link  (link agent to your Clickr account via browser)');
  console.error('  clickr-cli agent [doctor|once|start|status]');
  process.exit(1);
}
