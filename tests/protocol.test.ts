import { describe, expect, it } from "vitest";
import {
  APP_TOOL_NAMES,
  buildRealtimeProtocol,
  ClientDebugMessageSchema,
  INTERNAL_CONTROL_TOOL_NAMES,
  normalizeToolResultInput,
  NavigationProgressSchema,
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

  it("accepts structured navigation progress from the mobile and mini program maps", () => {
    const parsed = NavigationProgressSchema.parse({
      type: "navigation_progress",
      routeId: "101->202-5",
      startRoomId: "101",
      targetRoomId: "202-5",
      activeLegIndex: 1,
      totalLegs: 9,
      completedLegs: 1,
      remainingLegs: 7,
      remainingMeters: 75,
      remainingSeconds: 111,
      current: { nodeId: "door-101", label: "101 门口", floor: "1F" },
      next: { nodeId: "c1-101", label: "走廊入口", floor: "1F", kind: "door", distanceMeters: 1, instruction: "出门进入走廊" },
      destination: { roomId: "202-5", label: "202-5", floor: "2F" },
      guidance: {
        phase: "walk",
        userAction: "confirm_next",
        currentSegmentLabel: "101 门口 → 走廊入口",
        nextActionLabel: "到达该节点后点下一步，或说下一步",
        canManualAdvance: true,
        canVoiceAdvance: true
      },
      heading: {
        calibrated: true,
        available: true,
        bearingDegrees: 18,
        status: "朝向已校准。"
      },
      canGoPrevious: true,
      canGoNext: true,
      isFinalLeg: false,
      ttsPrompt: "第 2 段，出门进入走廊，到走廊入口，约 1 米。",
      announce: true,
      reason: "manual_next"
    });

    expect(parsed.next?.label).toBe("走廊入口");
    expect(parsed.guidance?.userAction).toBe("confirm_next");
    expect(parsed.heading?.calibrated).toBe(true);
    expect(parsed.remainingMeters).toBe(75);
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
    const navigationProgress = protocol.clientMessages.find((message) => message.type === "navigation_progress");
    expect(navigationProgress?.optional).toContain("guidance");
    expect(navigationProgress?.optional).toContain("heading");
    expect(protocol.textBoundaries.emittedFor).toEqual(["asr_end", "llm_end", "tts_sentence_end", "tts_end"]);
    expect(protocol.outputAudio).toMatchObject({
      format: "pcm_f32le",
      sampleRate: 24000,
      channels: 1
    });
  });
});
