import { describe, expect, it } from "vitest";
import {
  APP_TOOL_NAMES,
  buildRealtimeProtocol,
  ClientDebugMessageSchema,
  INTERNAL_CONTROL_TOOL_NAMES,
  normalizeToolResultInput,
  ToolResultInputSchema,
  toToolRequestPayload
} from "../src/protocol.js";

describe("service protocol", () => {
  it("accepts client debug messages without treating them as tool calls", () => {
    const parsed = ClientDebugMessageSchema.parse({
      type: "client_debug",
      level: "error",
      event: "microphone_error",
      message: "getUserMedia not found",
      data: { secureContext: false }
    });

    expect(parsed).toMatchObject({
      type: "client_debug",
      level: "error",
      event: "microphone_error"
    });
  });

  it("accepts app tool results for map and navigation actions", () => {
    const parsed = ToolResultInputSchema.parse({
      type: "tool_result",
      toolCallId: "tool-1",
      tool: "map.close",
      summary: "地图已关闭"
    });

    expect(normalizeToolResultInput(parsed)).toMatchObject({
      toolCallId: "tool-1",
      tool: "map.close",
      summary: "地图已关闭"
    });
  });

  it("serializes tool requests for app clients", () => {
    expect(
      toToolRequestPayload({
        toolCallId: "tool-1",
        turnId: "turn-1",
        tool: "navigation.start",
        args: { place: "北京南站" },
        spoken: "我来导航到北京南站。",
        prompt: "internal prompt"
      })
    ).toEqual({
      type: "tool_request",
      request: {
        toolCallId: "tool-1",
        turnId: "turn-1",
        tool: "navigation.start",
        args: { place: "北京南站" },
        spoken: "我来导航到北京南站。",
        prompt: "internal prompt"
      }
    });
  });

  it("publishes stable app protocol metadata", () => {
    const protocol = buildRealtimeProtocol({
      inputFormat: "pcm_s16le",
      outputFormat: "pcm_f32le",
      sampleRate: 24000
    });

    expect(APP_TOOL_NAMES).toEqual([
      "map.open",
      "map.close",
      "map.set_origin",
      "map.set_destination",
      "navigation.start",
      "navigation.next",
      "navigation.previous",
      "navigation.status"
    ]);
    expect(INTERNAL_CONTROL_TOOL_NAMES).toEqual(["control.kill"]);
    expect(protocol.textBoundaries.messageEndType).toBe("message_end");
    expect(protocol.clientMessages.map((message) => message.type)).toContain("client_debug");
    expect(protocol.clientMessages.map((message) => message.type)).toContain("navigation_progress");
    expect(protocol.textBoundaries.emittedFor).toEqual(["asr_end", "llm_end", "tts_sentence_end", "tts_end"]);
    expect(protocol.outputAudio).toMatchObject({
      format: "pcm_f32le",
      sampleRate: 24000,
      channels: 1
    });
  });
});
