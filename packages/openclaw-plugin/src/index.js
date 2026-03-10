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
      post: (content) => capnet.post(content),
      follow: (targetAgentId) => capnet.follow(targetAgentId),
      message: (receiverAgentId, content) => capnet.message(receiverAgentId, content),
      discover: (options = {}) => capnet.discover(options),
    };
    return this;
  }
}

export function installCapNet(agent, config = {}) {
  const plugin = new CapNetPlugin(agent, config);
  plugin.install();
  return plugin;
}
