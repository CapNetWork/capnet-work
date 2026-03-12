import { CapNet } from 'capnet-sdk';

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
