import path from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { ZodError } from "zod";
import { getConfigStatus, loadConfig, type AppConfig } from "./config.js";
import { DuplexService } from "./duplexService.js";
import { StageError } from "./errors.js";
import { MockAsrProvider, MockLlmProvider, MockTtsProvider } from "./providers/mock.js";
import { OpenAiCompatLlmProvider } from "./providers/openaiCompat.js";
import { VolcengineFlashAsrProvider } from "./providers/volcengineAsr.js";
import { VolcengineSseTtsProvider } from "./providers/volcengineTts.js";

export function buildServer(config: AppConfig = loadConfig()) {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: 25 * 1024 * 1024
  });

  const service = new DuplexService(
    config.demoMock
      ? { asr: new MockAsrProvider(), llm: new MockLlmProvider(), tts: new MockTtsProvider() }
      : {
          asr: new VolcengineFlashAsrProvider(config.asr),
          llm: new OpenAiCompatLlmProvider(config.llm),
          tts: new VolcengineSseTtsProvider(config.tts)
        }
  );

  app.register(fastifyStatic, {
    root: path.join(process.cwd(), "public"),
    prefix: "/"
  });

  app.get("/api/health", async () => ({
    status: "ok",
    config: getConfigStatus(config)
  }));

  app.post("/api/turn", async (request, reply) => {
    try {
      return await service.handleTurn(request.body);
    } catch (error) {
      const payload = toErrorPayload(error, request.id);
      return reply.status(payload.statusCode).send(payload.body);
    }
  });

  app.post("/api/text-turn", async (request, reply) => {
    try {
      return await service.handleTextTurn(request.body);
    } catch (error) {
      const payload = toErrorPayload(error, request.id);
      return reply.status(payload.statusCode).send(payload.body);
    }
  });

  app.post("/api/session/:sessionId/reset", async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    service.resetSession(sessionId);
    return { ok: true, sessionId };
  });

  return app;
}

function toErrorPayload(error: unknown, requestId: string) {
  if (error instanceof StageError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: {
          stage: error.stage,
          message: error.message,
          requestId,
          details: error.details
        }
      }
    };
  }
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        error: {
          stage: "request",
          message: "Invalid request body",
          requestId,
          details: error.issues
        }
      }
    };
  }
  return {
    statusCode: 500,
    body: {
      error: {
        stage: "request",
        message: error instanceof Error ? error.message : "Unknown error",
        requestId
      }
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const app = buildServer(config);
  app.listen({ port: config.port, host: "0.0.0.0" }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
