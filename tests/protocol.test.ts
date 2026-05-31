import { describe, expect, it } from "vitest";
import { normalizeToolResultInput, ToolResultInputSchema, toToolRequestPayload } from "../src/protocol.js";

describe("service protocol", () => {
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
});
