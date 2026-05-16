import { describe, expect, it } from "vitest";
import { extractTranscript, inferAudioFormat } from "../src/providers/volcengineAsr.js";

describe("volcengine parser helpers", () => {
  it("infers wav from browser-generated audio", () => {
    expect(inferAudioFormat("audio/wav")).toBe("wav");
  });

  it("extracts transcript from nested ASR-like responses", () => {
    expect(extractTranscript({ result: { utterances: [{ text: "你好，" }, { text: "世界。" }] } })).toBe(
      "你好，世界。"
    );
  });
});
