import "dotenv/config";
import { z } from "zod";
import { DEFAULT_REALTIME_SPEAKER, RealtimeSpeakerSchema } from "./runtimeSettings.js";

const RawEnv = z.object({
  PORT: z.coerce.number().int().positive().default(5177),
  PUBLIC_ORIGIN: z.string().default("http://localhost:5177"),

  APP_ID: z.string().optional(),
  ACCESS_TOKEN: z.string().optional(),
  SECRET_KEY: z.string().optional(),

  VOLCENGINE_REALTIME_ENDPOINT: z
    .string()
    .default("wss://openspeech.bytedance.com/api/v3/realtime/dialogue"),
  VOLCENGINE_REALTIME_APP_ID: z.string().optional(),
  VOLCENGINE_REALTIME_ACCESS_TOKEN: z.string().optional(),
  VOLCENGINE_REALTIME_RESOURCE_ID: z.string().default("volc.speech.dialog"),
  VOLCENGINE_REALTIME_APP_KEY: z.string().default("PlgvMymc7f3tQnJ6"),
  VOLCENGINE_REALTIME_SPEAKER: RealtimeSpeakerSchema.default(DEFAULT_REALTIME_SPEAKER),
  VOLCENGINE_REALTIME_SAMPLE_RATE: z.coerce.number().int().positive().default(24000)
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = RawEnv.parse(env);
  const realtimeAppId = parsed.VOLCENGINE_REALTIME_APP_ID || parsed.APP_ID || "";
  const realtimeAccessToken = parsed.VOLCENGINE_REALTIME_ACCESS_TOKEN || parsed.ACCESS_TOKEN || "";

  return {
    port: parsed.PORT,
    publicOrigin: parsed.PUBLIC_ORIGIN,
    realtime: {
      endpoint: parsed.VOLCENGINE_REALTIME_ENDPOINT,
      appId: realtimeAppId,
      accessToken: realtimeAccessToken,
      resourceId: parsed.VOLCENGINE_REALTIME_RESOURCE_ID,
      appKey: parsed.VOLCENGINE_REALTIME_APP_KEY,
      speaker: parsed.VOLCENGINE_REALTIME_SPEAKER,
      sampleRate: parsed.VOLCENGINE_REALTIME_SAMPLE_RATE,
      inputFormat: "pcm_s16le" as const,
      outputFormat: "pcm_f32le" as const
    }
  };
}

export function getConfigStatus(config: AppConfig) {
  const missing: string[] = [];
  if (!config.realtime.appId) missing.push("VOLCENGINE_REALTIME_APP_ID or APP_ID");
  if (!config.realtime.accessToken) missing.push("VOLCENGINE_REALTIME_ACCESS_TOKEN or ACCESS_TOKEN");

  return {
    ok: missing.length === 0,
    missing,
    realtime: {
      endpoint: config.realtime.endpoint,
      resourceId: config.realtime.resourceId,
      speaker: config.realtime.speaker,
      sampleRate: config.realtime.sampleRate,
      inputFormat: config.realtime.inputFormat,
      outputFormat: config.realtime.outputFormat,
      configured: Boolean(config.realtime.appId && config.realtime.accessToken)
    }
  };
}
