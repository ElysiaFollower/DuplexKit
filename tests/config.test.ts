import { describe, expect, it } from "vitest";
import { getConfigStatus, loadConfig } from "../src/config.js";

describe("config", () => {
  it("maps DreamingRAG DEEPSEEK_API_KEY into the LLM config", () => {
    const config = loadConfig({
      DEEPSEEK_API_KEY: "sk-test",
      DEMO_MOCK: "0",
      VOLCENGINE_ASR_APP_KEY: "asr",
      VOLCENGINE_TTS_API_KEY: "tts"
    });
    expect(config.llm.apiKey).toBe("sk-test");
    expect(getConfigStatus(config).ok).toBe(true);
    expect(config.tts.localFallback).toBe(true);
    expect(config.preferBrowserAsr).toBe(true);
  });

  it("maps old Volcengine APP_ID and ACCESS_TOKEN into ASR/TTS auth", () => {
    const config = loadConfig({
      DEEPSEEK_API_KEY: "sk-test",
      APP_ID: "app-id",
      ACCESS_TOKEN: "token"
    });
    const status = getConfigStatus(config);

    expect(status.ok).toBe(true);
    expect(status.asr.authMode).toBe("app-token");
    expect(status.tts.authMode).toBe("app-token");
    expect(status.client.preferBrowserAsr).toBe(true);
    expect(config.asr.appKey).toBe("app-id");
    expect(config.tts.appId).toBe("app-id");
    expect(config.tts.accessKey).toBe("token");
  });

  it("reports missing external API variables outside mock mode", () => {
    const status = getConfigStatus(loadConfig({ DEMO_MOCK: "0" }));
    expect(status.ok).toBe(false);
    expect(status.missing).toContain("LLM_API_KEY or DEEPSEEK_API_KEY");
    expect(status.missing).toContain("VOLCENGINE_ASR_API_KEY or APP_ID");
  });
});
