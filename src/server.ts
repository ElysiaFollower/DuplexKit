import path from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import { getConfigStatus, loadConfig, type AppConfig } from "./config.js";
import { attachVolcRealtimeBridge } from "./volcRealtime.js";

export function buildServer(config: AppConfig = loadConfig()) {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: 2 * 1024 * 1024
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
