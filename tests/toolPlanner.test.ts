import { describe, expect, it } from "vitest";
import { DemoToolRuntime } from "../src/toolPlanner.js";

describe("DemoToolRuntime", () => {
  it("plans map open", () => {
    const runtime = new DemoToolRuntime();
    expect(runtime.plan("打开地图")).toMatchObject({
      action: "tool_call",
      tool: "map.open"
    });
  });

  it("plans map close", () => {
    const runtime = new DemoToolRuntime();
    expect(runtime.plan("关闭地图")).toMatchObject({
      action: "tool_call",
      tool: "map.close"
    });
  });

  it("asks clarification for office identity shortcuts", () => {
    const runtime = new DemoToolRuntime();
    expect(runtime.plan("是我，导航到我的办公室")).toMatchObject({
      action: "ask_clarification",
      missing: ["user_identity", "office_location"]
    });
  });

  it("plans navigation destination", () => {
    const runtime = new DemoToolRuntime();
    expect(runtime.plan("导航到北京南站")).toMatchObject({
      action: "tool_call",
      tool: "navigation.start",
      args: { place: "北京南站" }
    });
  });

  it("normalizes client tool results", () => {
    const runtime = new DemoToolRuntime();
    const decision = runtime.plan("导航到北京南站");
    if (decision.action !== "tool_call") throw new Error("expected tool call");
    const call = runtime.start("turn-1", decision);

    expect(
      runtime.resolve(call, {
        toolCallId: call.toolCallId,
        summary: "真实导航已开始",
        visibleResult: "路线已显示在金工小子地图上"
      })
    ).toMatchObject({
      toolCallId: call.toolCallId,
      tool: "navigation.start",
      status: "success",
      origin: "client",
      summary: "真实导航已开始"
    });
  });

  it("drops superseded tool results", async () => {
    const runtime = new DemoToolRuntime();
    const decision = runtime.plan("打开地图");
    if (decision.action !== "tool_call") throw new Error("expected tool call");
    const call = runtime.start("turn-1", decision);
    runtime.markPossiblySuperseded();

    await expect(runtime.execute(call.toolCallId)).resolves.toBeNull();
  });
});
