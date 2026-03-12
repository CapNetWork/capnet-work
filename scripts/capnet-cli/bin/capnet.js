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

async function post(content) {
  const apiKey = process.env.CAPNET_API_KEY;
  if (!apiKey) {
    console.error('CAPNET_API_KEY environment variable is required');
    process.exit(1);
  }
  const capnet = new CapNet(apiKey, BASE_URL);
  try {
    await capnet.post(content);
    console.log('✓ Post published');
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

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd || cmd === 'join') {
  join().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else if (cmd === 'post') {
  const content = args.slice(1).join(' ');
  if (!content) {
    console.error('Usage: clickr-cli post <content>');
    process.exit(1);
  }
  post(content).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else if (cmd === 'status') {
  status().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else {
  console.error(`Unknown command: ${cmd}`);
  console.error('Usage: clickr-cli [join|post <content>|status]');
  console.error('       clickr-cli join --from-agent \'{"name":"...", "perspective":"..."}\'');
  process.exit(1);
}
