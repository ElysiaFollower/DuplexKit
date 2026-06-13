import { describe, expect, it } from "vitest";
import { DEFAULT_SYSTEM_ROLE } from "../src/runtimeSettings.js";
import { DemoToolRuntime, parseAssistantToolDeclaration } from "../src/toolPlanner.js";

describe("DemoToolRuntime", () => {
  it("instructs the realtime model to emit only one fixed declaration in tool mode", () => {
    expect(DEFAULT_SYSTEM_ROLE).toContain("整轮回复只能包含下面某一个固定句式本身");
    expect(DEFAULT_SYSTEM_ROLE).toContain("句式前后都不能添加任何解释");
    expect(DEFAULT_SYSTEM_ROLE).toContain("工具调用声明说完后立即停止本轮回复");
    expect(DEFAULT_SYSTEM_ROLE).toContain("设置终点并启动导航");
    expect(DEFAULT_SYSTEM_ROLE).toContain("不要声称工具结果已经返回");
    expect(DEFAULT_SYSTEM_ROLE).not.toContain("你可以简短闲聊");
  });

  it("plans map open from assistant declaration", () => {
    const runtime = new DemoToolRuntime();
    expect(runtime.plan("我来调用地图工具：打开地图。")).toMatchObject({
      action: "tool_call",
      tool: "map.open"
    });
  });

  it("plans map open when the assistant appends extra spoken text after the declaration", () => {
    const runtime = new DemoToolRuntime();
    expect(runtime.plan("我来调用地图工具：打开地图。地图打开后，你要是想设置起点或终点，直接告诉我就行。")).toMatchObject({
      action: "tool_call",
      tool: "map.open"
    });
  });

  it("plans tool calls when the assistant puts the fixed declaration after a sentence boundary", () => {
    expect(parseAssistantToolDeclaration("有这个可能，我再准确输入试试。我来调用地图工具：设置起点为208多媒体教室。")).toMatchObject({
      action: "tool_call",
      tool: "map.set_origin",
      args: { place: "208多媒体教室" }
    });
  });

  it("does not plan from quoted retrospective tool declarations", () => {
    expect(parseAssistantToolDeclaration("刚才后端收到的命令是“我来调用地图工具：设置起点为208多媒体教室”。")).toMatchObject({
      action: "no_action"
    });
  });

  it("plans map close from assistant declaration", () => {
    const runtime = new DemoToolRuntime();
    expect(runtime.plan("我来调用地图工具：关闭地图。")).toMatchObject({
      action: "tool_call",
      tool: "map.close"
    });
  });

  it("does not plan from user ASR-like text", () => {
    expect(parseAssistantToolDeclaration("导航到北京南站")).toMatchObject({
      action: "no_action"
    });
  });

  it("plans navigation destination from assistant declaration", () => {
    const runtime = new DemoToolRuntime();
    expect(runtime.plan("我来调用导航工具：导航到北京南站。")).toMatchObject({
      action: "tool_call",
      tool: "navigation.start",
      args: { place: "北京南站" }
    });
  });

  it("prefers navigation when the assistant emits destination and navigation declarations in one response", () => {
    expect(
      parseAssistantToolDeclaration("好的，我先帮你设置终点为114教室，再启动导航。我来调用地图工具：设置终点为114教室。设置完成后，我来调用导航工具：导航到114教室。")
    ).toMatchObject({
      action: "tool_call",
      tool: "navigation.start",
      args: { place: "114教室" }
    });
  });

  it("keeps tool arguments scoped to the declaration sentence", () => {
    expect(parseAssistantToolDeclaration("我来调用地图工具：设置终点为西门。你稍等一下。")).toMatchObject({
      action: "tool_call",
      tool: "map.set_destination",
      args: { place: "西门" }
    });
  });

  it("plans control kill from assistant declaration", () => {
    expect(parseAssistantToolDeclaration("我来调用控制工具：取消当前工具调用。")).toMatchObject({
      action: "tool_call",
      tool: "control.kill"
    });
  });

  it("rejects non-whitelisted assistant phrasing", () => {
    expect(parseAssistantToolDeclaration("我来帮你看看地图。")).toMatchObject({
      action: "no_action"
    });
  });

  it("normalizes client tool results", () => {
    const runtime = new DemoToolRuntime();
    const decision = runtime.plan("我来调用导航工具：导航到北京南站。");
    if (decision.action !== "tool_call") throw new Error("expected tool call");
    const call = runtime.start("turn-1", decision);

    const normalized = runtime.resolve(call, {
      toolCallId: call.toolCallId,
      summary: "真实导航已开始",
      visibleResult: "路线已显示在金工小子地图上"
    });

    expect(normalized).toMatchObject({
      toolCallId: call.toolCallId,
      tool: "navigation.start",
      status: "success",
      origin: "client",
      summary: "真实导航已开始"
    });
    expect(runtime.hasRunningCall()).toBe(false);
  });

  it("drops superseded tool results", async () => {
    const runtime = new DemoToolRuntime();
    const decision = runtime.plan("我来调用地图工具：打开地图。");
    if (decision.action !== "tool_call") throw new Error("expected tool call");
    const call = runtime.start("turn-1", decision);
    runtime.markPossiblySuperseded();

    await expect(runtime.execute(call.toolCallId)).resolves.toBeNull();
  });

  it("cancels a running tool call", () => {
    const runtime = new DemoToolRuntime();
    const decision = runtime.plan("我来调用导航工具：导航到北京南站。");
    if (decision.action !== "tool_call") throw new Error("expected tool call");
    runtime.start("turn-1", decision);

    expect(runtime.cancelRunningCall()).toMatchObject({
      tool: "control.kill",
      summary: "刚才的工具调用已取消"
    });
    expect(runtime.hasRunningCall()).toBe(false);
  });

  it("reports no running call for kill without pending work", () => {
    const runtime = new DemoToolRuntime();
    expect(runtime.cancelRunningCall()).toMatchObject({
      tool: "control.kill",
      summary: "当前没有正在执行的工具调用"
    });
  });
});
