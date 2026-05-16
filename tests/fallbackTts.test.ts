import { describe, expect, it } from "vitest";
import { StageError } from "../src/errors.js";
import { FallbackTtsProvider } from "../src/providers/fallbackTts.js";
import type { TtsProvider } from "../src/providers/types.js";

describe("FallbackTtsProvider", () => {
  it("uses fallback TTS when primary fails", async () => {
    const primary: TtsProvider = {
      synthesize: async () => {
        throw new StageError("tts", "primary failed");
      }
    };
    const fallback: TtsProvider = {
      synthesize: async () => ({ audioBase64: "ZmFrZQ==", mimeType: "audio/wav" })
    };

    const result = await new FallbackTtsProvider(primary, fallback).synthesize({
      text: "hello",
      requestId: "r1",
      uid: "u1"
    });

    expect(result.mimeType).toBe("audio/wav");
    expect(result.audioBase64).toBe("ZmFrZQ==");
  });
});
