import path from "node:path";
import { pathToFileURL } from "node:url";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import { getConfigStatus, loadConfig, type AppConfig } from "./config.js";
import { jingongRoomCatalogPayload } from "./jingongRooms.js";
import {
  getRuntimeSettings,
  initializeRuntimeSettingsDefaults,
  updateRuntimeSettings,
  VOLCENGINE_REALTIME_SPEAKER_PRESETS
} from "./runtimeSettings.js";
import { saveSessionLog, SessionLogPayload } from "./sessionLogs.js";
import { TOOL_DEFINITIONS, TOOL_PROMPT_TEMPLATES } from "./toolPlanner.js";
import { attachVolcRealtimeBridge, injectRealtimeDebugAudio, listRealtimeDebugSessions } from "./volcRealtime.js";
import { APP_TOOL_NAMES, buildRealtimeProtocol } from "./protocol.js";
import { loadRealtimeDebugFixturePcm, RealtimeDebugFixtureRequest } from "./realtimeDebugFixtures.js";

const appToolNameSet = new Set<string>(APP_TOOL_NAMES);

export function buildServer(config: AppConfig = loadConfig()) {
  initializeRuntimeSettingsDefaults({ speaker: config.realtime.speaker });
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: 10 * 1024 * 1024
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", request.headers.origin ?? "*");
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "content-type,authorization");
    reply.header("Access-Control-Max-Age", "86400");
    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }
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
    speakerPresets: VOLCENGINE_REALTIME_SPEAKER_PRESETS,
    note: "Main realtime system_role/speaking_style/speaker. Changes apply to the next realtime session."
  }));

  app.put("/api/runtime-settings", async (request) => ({
    settings: updateRuntimeSettings(request.body)
  }));

  app.get("/api/tools", async () => ({
    tools: TOOL_DEFINITIONS.filter((tool) => appToolNameSet.has(tool.name)),
    promptTemplates: TOOL_PROMPT_TEMPLATES,
    realtimeProtocol: buildRealtimeProtocol(config.realtime)
  }));

  app.get("/api/jingong-rooms", async () => jingongRoomCatalogPayload());

  app.get("/api/debug/realtime-sessions", async () => ({
    sessions: listRealtimeDebugSessions()
  }));

  app.post("/api/debug/realtime-fixture", async (request, reply) => {
    const parsed = RealtimeDebugFixtureRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid realtime fixture request", issues: parsed.error.issues });
    }
    const pcm = await loadRealtimeDebugFixturePcm(parsed.data.fixture);
    const result = await injectRealtimeDebugAudio(pcm, { silenceMs: parsed.data.silenceMs });
    if (!result.ok) return reply.status(409).send(result);
    return reply.send({ ...result, fixture: parsed.data.fixture });
  });

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

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const config = loadConfig();
  const app = buildServer(config);
  app.listen({ port: config.port, host: "0.0.0.0" }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
