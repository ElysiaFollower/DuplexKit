import path from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import { getConfigStatus, loadConfig, type AppConfig } from "./config.js";
import { getRuntimeSettings, updateRuntimeSettings } from "./runtimeSettings.js";
import { saveSessionLog, SessionLogPayload } from "./sessionLogs.js";
import { TOOL_DEFINITIONS, TOOL_PROMPT_TEMPLATES } from "./toolPlanner.js";
import { attachVolcRealtimeBridge } from "./volcRealtime.js";
import { TOOL_NAMES } from "./toolPlanner.js";

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
    tools: TOOL_DEFINITIONS,
    promptTemplates: TOOL_PROMPT_TEMPLATES,
    realtimeProtocol: {
      websocket: "/api/realtime",
      inputAudio: {
        transport: "binary websocket frame",
        format: config.realtime.inputFormat,
        sampleRate: config.realtime.sampleRate,
        channels: 1
      },
      outputAudio: {
        transport: "binary websocket frame",
        format: config.realtime.outputFormat,
        sampleRate: config.realtime.sampleRate,
        channels: 1
      },
      clientMessages: [
        {
          type: "tool_result",
          description: "应用端完成真实地图/导航动作后回传结果；后端会把结果转成语音反馈。",
          required: ["toolCallId", "summary"],
          optional: ["tool", "status", "visibleResult", "debugNote"]
        },
        {
          type: "stop",
          description: "关闭当前 realtime 会话。"
        }
      ],
      serverMessages: [
        {
          type: "tool_request",
          description: "后端 Planner 请求应用端执行地图/导航动作。",
          payload: "request: { toolCallId, turnId, tool, args, spoken, prompt }"
        }
      ],
      toolNames: TOOL_NAMES
    }
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
