import { describe, expect, it } from "vitest";
import { getConfigStatus, loadConfig } from "../src/config.js";

describe("config", () => {
  it("maps DreamingRAG DEEPSEEK_API_KEY into the LLM config", () => {
    const config = loadConfig({
      DEEPSEEK_API_KEY: "sk-test",
      DEMO_MOCK: "0",
      APP_ID: "app-id",
      ACCESS_TOKEN: "token"
    });
    expect(config.llm.apiKey).toBe("sk-test");
    expect(getConfigStatus(config).ok).toBe(true);
    expect(config.tts.localFallback).toBe(true);
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
    expect(status.realtime.configured).toBe(true);
    expect(config.asr.appKey).toBe("app-id");
    expect(config.realtime.appId).toBe("app-id");
    expect(config.realtime.accessToken).toBe("token");
    expect(config.tts.appId).toBe("app-id");
    expect(config.tts.accessKey).toBe("token");
  });

  it("reports missing external API variables outside mock mode", () => {
    const status = getConfigStatus(loadConfig({ DEMO_MOCK: "0" }));
    expect(status.ok).toBe(false);
    expect(status.missing).toContain("VOLCENGINE_REALTIME_APP_ID or APP_ID");
    expect(status.missing).toContain("VOLCENGINE_REALTIME_ACCESS_TOKEN or ACCESS_TOKEN");
  });
});
