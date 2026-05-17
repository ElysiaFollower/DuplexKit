import "dotenv/config";
import { z } from "zod";

const RawEnv = z.object({
  PORT: z.coerce.number().int().positive().default(5177),
  PUBLIC_ORIGIN: z.string().default("http://localhost:5177"),
  DEMO_MOCK: z.string().optional(),

  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().optional(),
  LLM_MODEL: z.string().default("deepseek-chat"),
  LLM_SYSTEM_PROMPT: z
    .string()
    .default("你是一个低延迟语音助手。回复要短、自然、口语化，优先中文。"),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().optional(),

  APP_ID: z.string().optional(),
  ACCESS_TOKEN: z.string().optional(),
  SECRET_KEY: z.string().optional(),
  VOLCENGINE_API_KEY: z.string().optional(),
  VOLCENGINE_ASR_ENDPOINT: z
    .string()
    .default("wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"),
  VOLCENGINE_ASR_API_KEY: z.string().optional(),
  VOLCENGINE_ASR_APP_KEY: z.string().optional(),
  VOLCENGINE_ASR_ACCESS_KEY: z.string().optional(),
  VOLCENGINE_ASR_RESOURCE_ID: z.string().default("volc.seedasr.sauc.duration"),

  VOLCENGINE_REALTIME_ENDPOINT: z
    .string()
    .default("wss://openspeech.bytedance.com/api/v3/realtime/dialogue"),
  VOLCENGINE_REALTIME_APP_ID: z.string().optional(),
  VOLCENGINE_REALTIME_ACCESS_TOKEN: z.string().optional(),
  VOLCENGINE_REALTIME_RESOURCE_ID: z.string().default("volc.speech.dialog"),
  VOLCENGINE_REALTIME_APP_KEY: z.string().default("PlgvMymc7f3tQnJ6"),
  VOLCENGINE_REALTIME_SPEAKER: z.string().default("zh_female_vv_jupiter_bigtts"),
  VOLCENGINE_REALTIME_SAMPLE_RATE: z.coerce.number().int().positive().default(24000),

  VOLCENGINE_TTS_ENDPOINT: z
    .string()
    .default("https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse"),
  VOLCENGINE_TTS_API_KEY: z.string().optional(),
  VOLCENGINE_TTS_APP_ID: z.string().optional(),
  VOLCENGINE_TTS_ACCESS_KEY: z.string().optional(),
  VOLCENGINE_TTS_RESOURCE_ID: z.string().default("seed-tts-2.0"),
  VOLCENGINE_TTS_SPEAKER: z.string().default("zh_female_xiaohe_uranus_bigtts"),
  VOLCENGINE_TTS_FORMAT: z.enum(["mp3", "ogg_opus", "pcm"]).default("mp3"),
  VOLCENGINE_TTS_SAMPLE_RATE: z.coerce.number().int().positive().default(24000),
  LOCAL_TTS_FALLBACK: z.string().default("1")
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = RawEnv.parse(env);
  const llmApiKey = parsed.LLM_API_KEY || parsed.DEEPSEEK_API_KEY || "";
  const llmBaseUrl = stripTrailingSlash(
    parsed.LLM_BASE_URL || parsed.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
  );
  const asrApiKey = parsed.VOLCENGINE_ASR_API_KEY || "";
  const asrAppKey = parsed.VOLCENGINE_ASR_APP_KEY || parsed.APP_ID || "";
  const asrAccessKey = parsed.VOLCENGINE_ASR_ACCESS_KEY || parsed.ACCESS_TOKEN || "";
  const realtimeAppId = parsed.VOLCENGINE_REALTIME_APP_ID || parsed.APP_ID || "";
  const realtimeAccessToken = parsed.VOLCENGINE_REALTIME_ACCESS_TOKEN || parsed.ACCESS_TOKEN || "";
  const ttsAppId = parsed.VOLCENGINE_TTS_APP_ID || parsed.APP_ID || "";
  const ttsAccessKey = parsed.VOLCENGINE_TTS_ACCESS_KEY || parsed.ACCESS_TOKEN || "";
  const ttsApiKey = parsed.VOLCENGINE_TTS_API_KEY || "";

  return {
    port: parsed.PORT,
    publicOrigin: parsed.PUBLIC_ORIGIN,
    demoMock: parsed.DEMO_MOCK === "1" || parsed.DEMO_MOCK === "true",
    llm: {
      apiKey: llmApiKey,
      baseUrl: llmBaseUrl,
      model: parsed.LLM_MODEL,
      systemPrompt: parsed.LLM_SYSTEM_PROMPT
    },
    asr: {
      endpoint: parsed.VOLCENGINE_ASR_ENDPOINT,
      apiKey: asrApiKey,
      appKey: asrAppKey,
      accessKey: asrAccessKey,
      resourceId: parsed.VOLCENGINE_ASR_RESOURCE_ID
    },
    realtime: {
      endpoint: parsed.VOLCENGINE_REALTIME_ENDPOINT,
      appId: realtimeAppId,
      accessToken: realtimeAccessToken,
      resourceId: parsed.VOLCENGINE_REALTIME_RESOURCE_ID,
      appKey: parsed.VOLCENGINE_REALTIME_APP_KEY,
      speaker: parsed.VOLCENGINE_REALTIME_SPEAKER,
      sampleRate: parsed.VOLCENGINE_REALTIME_SAMPLE_RATE
    },
    tts: {
      endpoint: parsed.VOLCENGINE_TTS_ENDPOINT,
      apiKey: ttsApiKey,
      appId: ttsAppId,
      accessKey: ttsAccessKey,
      resourceId: parsed.VOLCENGINE_TTS_RESOURCE_ID,
      speaker: parsed.VOLCENGINE_TTS_SPEAKER,
      format: parsed.VOLCENGINE_TTS_FORMAT,
      sampleRate: parsed.VOLCENGINE_TTS_SAMPLE_RATE,
      localFallback: parsed.LOCAL_TTS_FALLBACK !== "0" && parsed.LOCAL_TTS_FALLBACK !== "false"
    }
  };
}

export function getConfigStatus(config: AppConfig) {
  const missing: string[] = [];
  if (!config.demoMock) {
    if (!config.realtime.appId) missing.push("VOLCENGINE_REALTIME_APP_ID or APP_ID");
    if (!config.realtime.accessToken) missing.push("VOLCENGINE_REALTIME_ACCESS_TOKEN or ACCESS_TOKEN");
  }
  return {
    ok: missing.length === 0,
    demoMock: config.demoMock,
    missing,
    llm: {
      baseUrl: config.llm.baseUrl,
      model: config.llm.model,
      configured: Boolean(config.llm.apiKey)
    },
    asr: {
      endpoint: config.asr.endpoint,
      resourceId: config.asr.resourceId,
      authMode: config.asr.apiKey ? "api-key" : config.asr.appKey ? "app-token" : "missing",
      configured: Boolean(config.asr.apiKey || config.asr.appKey)
    },
    realtime: {
      endpoint: config.realtime.endpoint,
      resourceId: config.realtime.resourceId,
      speaker: config.realtime.speaker,
      sampleRate: config.realtime.sampleRate,
      configured: Boolean(config.realtime.appId && config.realtime.accessToken)
    },
    tts: {
      endpoint: config.tts.endpoint,
      resourceId: config.tts.resourceId,
      speaker: config.tts.speaker,
      localFallback: config.tts.localFallback && process.platform === "darwin",
      authMode: config.tts.apiKey ? "api-key" : config.tts.appId && config.tts.accessKey ? "app-token" : "missing",
      configured: Boolean(config.tts.apiKey || (config.tts.appId && config.tts.accessKey))
    }
  };
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
