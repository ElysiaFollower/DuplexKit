import path from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import { getConfigStatus, loadConfig, type AppConfig } from "./config.js";
import { getRuntimeSettings, updateRuntimeSettings } from "./runtimeSettings.js";
import { saveSessionLog, SessionLogPayload } from "./sessionLogs.js";
import { TOOL_DEFINITIONS, TOOL_PROMPT_TEMPLATES } from "./toolPlanner.js";
import { attachVolcRealtimeBridge } from "./volcRealtime.js";
import { APP_TOOL_NAMES, buildRealtimeProtocol } from "./protocol.js";

const appToolNameSet = new Set<string>(APP_TOOL_NAMES);

export function buildServer(config: AppConfig = loadConfig()) {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: 10 * 1024 * 1024
  });

  app.register(async (routes) => {
    await routes.register(fastifyWebsocket);
    routes.route({
      method: "GET",
      url: "/api/realtime",
      handler: async (_request, reply) => {
        return reply.status(426).send({ error: "WebSocket upgrade required" });
      },
      wsHandler: (socket) => {
        attachVolcRealtimeBridge(socket, config.realtime);
      }
    });
  });

  app.register(fastifyStatic, {
    root: path.join(process.cwd(), "public"),
    prefix: "/"
  });

  app.get("/api/health", async () => ({
    status: "ok",
    config: getConfigStatus(config)
  }));

  app.get("/api/runtime-settings", async () => ({
    settings: getRuntimeSettings(),
    note: "Main realtime system_role/speaking_style. Changes apply to the next realtime session."
  }));

  app.put("/api/runtime-settings", async (request) => ({
    settings: updateRuntimeSettings(request.body)
  }));

  app.get("/api/tools", async () => ({
    tools: TOOL_DEFINITIONS.filter((tool) => appToolNameSet.has(tool.name)),
    promptTemplates: TOOL_PROMPT_TEMPLATES,
    realtimeProtocol: buildRealtimeProtocol(config.realtime)
  }));

  app.post("/api/session-logs", async (request, reply) => {
    const parsed = SessionLogPayload.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid session log payload", issues: parsed.error.issues });
    }

    const saved = await saveSessionLog(parsed.data);
    return reply.status(201).send(saved);
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const app = buildServer(config);
  app.listen({ port: config.port, host: "0.0.0.0" }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
