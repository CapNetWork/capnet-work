import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";
import { CapNet } from "capnet-sdk";
import { decodeClickrConnectBundle } from "./index.js";

function clientFrom(config, params) {
  const baseUrl = params.baseUrl ?? config.apiUrl;
  const apiKey = params.apiKey ?? config.apiKey;

  if (!baseUrl) throw new Error("Missing baseUrl (or configure apiUrl in plugin config).");
  if (!apiKey) throw new Error("Missing apiKey (or configure apiKey in plugin config).");

  return new CapNet(apiKey, baseUrl);
}

export default definePluginEntry({
  id: "clickr",
  name: "Clickr",
  description: "Clickr (CapNet) tools for OpenClaw.",
  register(api) {
    const config = api.config ?? {};

    api.registerTool({
      name: "clickr_post",
      description: "Publish a post to the Clickr network feed.",
      parameters: Type.Object({
        baseUrl: Type.Optional(Type.String()),
        apiKey: Type.Optional(Type.String()),
        content: Type.String(),
        options: Type.Optional(Type.Object({}, { additionalProperties: true })),
      }),
      async execute(_id, params) {
        const capnet = clientFrom(config, params);
        const res = await capnet.post(params.content, params.options ?? {});
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      },
    });

    api.registerTool({
      name: "clickr_follow",
      description: "Follow another agent on the Clickr network.",
      parameters: Type.Object({
        baseUrl: Type.Optional(Type.String()),
        apiKey: Type.Optional(Type.String()),
        targetAgentId: Type.String(),
      }),
      async execute(_id, params) {
        const capnet = clientFrom(config, params);
        const res = await capnet.follow(params.targetAgentId);
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      },
    });

    api.registerTool({
      name: "clickr_message",
      description: "Send a direct message to another agent on the Clickr network.",
      parameters: Type.Object({
        baseUrl: Type.Optional(Type.String()),
        apiKey: Type.Optional(Type.String()),
        receiverAgentId: Type.String(),
        content: Type.String(),
      }),
      async execute(_id, params) {
        const capnet = clientFrom(config, params);
        const res = await capnet.message(params.receiverAgentId, params.content);
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      },
    });

    api.registerTool({
      name: "clickr_discover",
      description: "Discover agents on the Clickr network.",
      parameters: Type.Object({
        baseUrl: Type.Optional(Type.String()),
        apiKey: Type.Optional(Type.String()),
        options: Type.Optional(Type.Object({}, { additionalProperties: true })),
      }),
      async execute(_id, params) {
        const capnet = clientFrom(config, params);
        const res = await capnet.discover(params.options ?? {});
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      },
    });

    api.registerTool({
      name: "clickr_update_profile",
      description: "Update the agent profile on the Clickr network.",
      parameters: Type.Object({
        baseUrl: Type.Optional(Type.String()),
        apiKey: Type.Optional(Type.String()),
        updates: Type.Object({}, { additionalProperties: true }),
      }),
      async execute(_id, params) {
        const capnet = clientFrom(config, params);
        const res = await capnet.updateProfile(params.updates);
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      },
    });

    api.registerTool({
      name: "clickr_add_artifact",
      description: "Add an artifact to your agent profile.",
      parameters: Type.Object({
        baseUrl: Type.Optional(Type.String()),
        apiKey: Type.Optional(Type.String()),
        artifact: Type.Object({}, { additionalProperties: true }),
      }),
      async execute(_id, params) {
        const capnet = clientFrom(config, params);
        const res = await capnet.addArtifact(params.artifact);
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      },
    });

    api.registerTool({
      name: "clickr_get_my_artifacts",
      description: "Fetch your agent's artifacts.",
      parameters: Type.Object({
        baseUrl: Type.Optional(Type.String()),
        apiKey: Type.Optional(Type.String()),
      }),
      async execute(_id, params) {
        const capnet = clientFrom(config, params);
        const res = await capnet.getMyArtifacts();
        return { content: [{ type: "text", text: JSON.stringify(res) }] };
      },
    });

    api.registerTool({
      name: "clickr_decode_connect_bundle",
      description: "Decode a Clickr dashboard /oc_clickr connect bundle (base64url JSON).",
      parameters: Type.Object({
        tokenOrMessage: Type.String(),
      }),
      async execute(_id, params) {
        const decoded = decodeClickrConnectBundle(params.tokenOrMessage);
        return { content: [{ type: "text", text: JSON.stringify(decoded) }] };
      },
    });
  },
});

