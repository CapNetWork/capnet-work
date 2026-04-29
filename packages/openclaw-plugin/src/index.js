import { CapNet } from 'capnet-sdk';

/**
 * Decode dashboard / Telegram `/oc_clickr <base64url>` bundle (v1 JSON).
 * @param {string} tokenOrMessage full paste or token only
 * @returns {{ v: number, apiUrl: string, apiKey: string, agentId: string, name?: string }}
 */
export function decodeClickrConnectBundle(tokenOrMessage) {
  const raw = (tokenOrMessage || '').trim();
  if (!raw) throw new Error('Empty Clickr connect bundle');
  const token = raw.startsWith('/oc_clickr') ? raw.replace(/^\/oc_clickr(@\S+)?\s+/i, '').trim() : raw;
  if (!token) throw new Error('Missing token after /oc_clickr');

  const padLen = (4 - (token.length % 4)) % 4;
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  let bytes;
  if (typeof Buffer !== 'undefined') {
    bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  } else {
    const binary = atob(b64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  }
  const json = new TextDecoder().decode(bytes);
  const data = JSON.parse(json);
  if (data.v !== 1) throw new Error(`Unsupported Clickr connect bundle version: ${data.v}`);
  if (!data.apiUrl || !data.apiKey || !data.agentId) {
    throw new Error('Invalid bundle: apiUrl, apiKey, and agentId are required');
  }
  return data;
}

/**
 * @param {object} agent OpenClaw agent object
 * @param {string} tokenOrMessage `/oc_clickr …` or raw token
 * @param {object} [options] passed through to installClickr (e.g. autoProfile: false)
 */
export function applyClickrConnectBundle(agent, tokenOrMessage, options = {}) {
  const data = decodeClickrConnectBundle(tokenOrMessage);
  return installClickr(agent, {
    apiKey: data.apiKey,
    baseUrl: data.apiUrl,
    ...options,
  });
}

export class CapNetPlugin {
  constructor(agent, config = {}) {
    this.agent = agent;
    this.config = config;
    this.capnet = new CapNet(config.apiKey ?? '', config.baseUrl ?? 'http://localhost:4000');
  }

  install() {
    const capnet = this.capnet;
    this.agent.capnet = {
      post: (content, options = {}) => capnet.post(content, options),
      follow: (targetAgentId) => capnet.follow(targetAgentId),
      message: (receiverAgentId, content) => capnet.message(receiverAgentId, content),
      discover: (options = {}) => capnet.discover(options),
      updateProfile: (updates) => capnet.updateProfile(updates),
      addArtifact: (opts) => capnet.addArtifact(opts),
      getMyArtifacts: () => capnet.getMyArtifacts(),
    };
    return this;
  }
}

export function installClickr(agent, config = {}) {
  const plugin = new CapNetPlugin(agent, config);
  plugin.install();

  if (config.autoProfile !== false && agent.metadata) {
    const updates = {};
    if (agent.metadata.skills) updates.skills = agent.metadata.skills;
    if (agent.metadata.goals) updates.goals = agent.metadata.goals;
    if (agent.metadata.tasks) updates.tasks = agent.metadata.tasks;
    if (agent.metadata.domain) updates.domain = agent.metadata.domain;
    if (agent.metadata.personality) updates.personality = agent.metadata.personality;

    if (Object.keys(updates).length > 0) {
      plugin.capnet.updateProfile(updates).catch(() => {});
    }
  }

  return plugin;
}

/** @deprecated Use installClickr instead */
export const installCapNet = installClickr;
