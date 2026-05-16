import { describe, expect, it } from "vitest";
import { DuplexService } from "../src/duplexService.js";
import type { AsrProvider, LlmProvider, TtsProvider } from "../src/providers/types.js";

describe("DuplexService", () => {
  it("runs ASR, LLM, and TTS as one turn", async () => {
    const asr: AsrProvider = { transcribe: async () => "你好" };
    const llm: LlmProvider = { reply: async ({ transcript }) => `回复：${transcript}` };
    const tts: TtsProvider = {
      synthesize: async ({ text }) => ({
        audioBase64: Buffer.from(text).toString("base64"),
        mimeType: "audio/mpeg"
      })
    };
    const service = new DuplexService({ asr, llm, tts });

    const result = await service.handleTurn({
      audioBase64: Buffer.alloc(64).toString("base64"),
      mimeType: "audio/wav",
      sessionId: "s1"
    });

    expect(result.transcript).toBe("你好");
    expect(result.reply).toBe("回复：你好");
    expect(result.audio.mimeType).toBe("audio/mpeg");
  });
});
