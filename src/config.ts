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

  VOLCENGINE_API_KEY: z.string().optional(),
  VOLCENGINE_ASR_ENDPOINT: z
    .string()
    .default("https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash"),
  VOLCENGINE_ASR_APP_KEY: z.string().optional(),
  VOLCENGINE_ASR_ACCESS_KEY: z.string().optional(),
  VOLCENGINE_ASR_RESOURCE_ID: z.string().default("volc.bigasr.auc_turbo"),

  VOLCENGINE_TTS_ENDPOINT: z
    .string()
    .default("https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse"),
  VOLCENGINE_TTS_API_KEY: z.string().optional(),
  VOLCENGINE_TTS_RESOURCE_ID: z.string().default("seed-tts-2.0"),
  VOLCENGINE_TTS_SPEAKER: z.string().default("zh_female_shuangkuaisisi_moon_bigtts"),
  VOLCENGINE_TTS_FORMAT: z.enum(["mp3", "ogg_opus", "pcm"]).default("mp3"),
  VOLCENGINE_TTS_SAMPLE_RATE: z.coerce.number().int().positive().default(24000)
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = RawEnv.parse(env);
  const llmApiKey = parsed.LLM_API_KEY || parsed.DEEPSEEK_API_KEY || "";
  const llmBaseUrl = stripTrailingSlash(
    parsed.LLM_BASE_URL || parsed.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
  );
  const asrAppKey = parsed.VOLCENGINE_ASR_APP_KEY || "";
  const asrAccessKey = parsed.VOLCENGINE_ASR_ACCESS_KEY || "";
  const ttsApiKey = parsed.VOLCENGINE_TTS_API_KEY || parsed.VOLCENGINE_API_KEY || "";

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
      appKey: asrAppKey,
      accessKey: asrAccessKey,
      resourceId: parsed.VOLCENGINE_ASR_RESOURCE_ID
    },
    tts: {
      endpoint: parsed.VOLCENGINE_TTS_ENDPOINT,
      apiKey: ttsApiKey,
      resourceId: parsed.VOLCENGINE_TTS_RESOURCE_ID,
      speaker: parsed.VOLCENGINE_TTS_SPEAKER,
      format: parsed.VOLCENGINE_TTS_FORMAT,
      sampleRate: parsed.VOLCENGINE_TTS_SAMPLE_RATE
    }
  };
}

export function getConfigStatus(config: AppConfig) {
  const missing: string[] = [];
  if (!config.demoMock) {
    if (!config.llm.apiKey) missing.push("LLM_API_KEY or DEEPSEEK_API_KEY");
    if (!config.asr.appKey) missing.push("VOLCENGINE_ASR_APP_KEY");
    if (!config.tts.apiKey) missing.push("VOLCENGINE_TTS_API_KEY or VOLCENGINE_API_KEY");
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
      configured: Boolean(config.asr.appKey)
    },
    tts: {
      endpoint: config.tts.endpoint,
      resourceId: config.tts.resourceId,
      speaker: config.tts.speaker,
      configured: Boolean(config.tts.apiKey)
    }
  };
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
