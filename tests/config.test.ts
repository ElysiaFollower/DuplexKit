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
  });

  it("reports missing external API variables outside mock mode", () => {
    const status = getConfigStatus(loadConfig({ DEMO_MOCK: "0" }));
    expect(status.ok).toBe(false);
    expect(status.missing).toContain("LLM_API_KEY or DEEPSEEK_API_KEY");
    expect(status.missing).toContain("VOLCENGINE_ASR_APP_KEY");
  });
});
