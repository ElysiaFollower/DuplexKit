import crypto from "node:crypto";

export type PlannerDecision =
  | { action: "no_action"; reason: string }
  | { action: "ask_clarification"; missing: string[]; question: string }
  | { action: "tool_call"; tool: ToolName; args: Record<string, string>; spoken: string };

export type ToolName = "map.open" | "map.set_origin" | "map.set_destination" | "navigation.start";

export type ToolCallState = {
  toolCallId: string;
  turnId: string;
  tool: ToolName;
  args: Record<string, string>;
  status: "running" | "completed" | "dropped";
  superseded: boolean;
};

export type ToolResult = {
  toolCallId: string;
  tool: ToolName;
  status: "success";
  summary: string;
  visibleResult: string;
};

type MapState = {
  opened: boolean;
  origin?: string;
  destination?: string;
  navigating: boolean;
};

export class DemoToolRuntime {
  private readonly map: MapState = { opened: false, navigating: false };
  private readonly running = new Map<string, ToolCallState>();

  plan(transcript: string): PlannerDecision {
    const text = normalize(transcript);
    if (!text) return { action: "no_action", reason: "empty transcript" };

    if (text.includes("办公室") && (text.includes("我") || text.includes("我的"))) {
      return {
        action: "ask_clarification",
        missing: ["user_identity", "office_location"],
        question: "您是 Ely 吗？办公室是中关村那间吗？"
      };
    }

    if (text.includes("打开地图") || text === "地图" || text.includes("打开3d地图")) {
      return { action: "tool_call", tool: "map.open", args: {}, spoken: "我来打开地图。" };
    }

    const origin = extractPlace(text, ["设置起点", "起点设为", "起点设置为", "从"]);
    if (origin) {
      return {
        action: "tool_call",
        tool: "map.set_origin",
        args: { place: origin },
        spoken: `我来把起点设为${origin}。`
      };
    }

    const destination = extractDestination(text);
    if (destination && (text.includes("导航") || text.includes("去") || text.includes("终点"))) {
      return {
        action: "tool_call",
        tool: text.includes("导航") ? "navigation.start" : "map.set_destination",
        args: { place: destination },
        spoken: text.includes("导航") ? `我来导航到${destination}。` : `我来把终点设为${destination}。`
      };
    }

    if (text.includes("开始导航") || text.includes("启动导航")) {
      return { action: "tool_call", tool: "navigation.start", args: {}, spoken: "我来启动导航。" };
    }

    return { action: "no_action", reason: "no demo tool intent" };
  }

  start(turnId: string, decision: Extract<PlannerDecision, { action: "tool_call" }>) {
    const state: ToolCallState = {
      toolCallId: crypto.randomUUID(),
      turnId,
      tool: decision.tool,
      args: decision.args,
      status: "running",
      superseded: false
    };
    this.running.set(state.toolCallId, state);
    return state;
  }

  markPossiblySuperseded() {
    for (const call of this.running.values()) {
      if (call.status === "running") call.superseded = true;
    }
  }

  async execute(toolCallId: string): Promise<ToolResult | null> {
    const call = this.running.get(toolCallId);
    if (!call) return null;
    await delay(900);
    const result = this.apply(call);
    if (call.superseded) {
      call.status = "dropped";
      this.running.delete(toolCallId);
      return null;
    }
    call.status = "completed";
    this.running.delete(toolCallId);
    return result;
  }

  private apply(call: ToolCallState): ToolResult {
    if (call.tool === "map.open") {
      this.map.opened = true;
      return {
        toolCallId: call.toolCallId,
        tool: call.tool,
        status: "success",
        summary: "地图已打开",
        visibleResult: "3D 地图已打开"
      };
    }

    if (call.tool === "map.set_origin") {
      this.map.opened = true;
      this.map.origin = call.args.place;
      return {
        toolCallId: call.toolCallId,
        tool: call.tool,
        status: "success",
        summary: `起点已设置为${call.args.place}`,
        visibleResult: `地图起点：${call.args.place}`
      };
    }

    if (call.tool === "map.set_destination") {
      this.map.opened = true;
      this.map.destination = call.args.place;
      return {
        toolCallId: call.toolCallId,
        tool: call.tool,
        status: "success",
        summary: `终点已设置为${call.args.place}`,
        visibleResult: `地图终点：${call.args.place}`
      };
    }

    this.map.opened = true;
    if (call.args.place) this.map.destination = call.args.place;
    this.map.navigating = true;
    const target = this.map.destination || call.args.place || "当前终点";
    return {
      toolCallId: call.toolCallId,
      tool: call.tool,
      status: "success",
      summary: `导航已启动，目的地是${target}`,
      visibleResult: `导航中：${this.map.origin || "当前位置"} -> ${target}`
    };
  }
}

export function toolStartedPrompt(call: ToolCallState, spoken: string) {
  return [
    `tool_call_id: ${call.toolCallId}`,
    `你刚刚决定执行外部动作 ${call.tool}。`,
    `动作参数：${JSON.stringify(call.args)}`,
    "动作正在执行中。",
    `请用第一人称简短告诉用户：“${spoken}”`,
    "不要提到后端、系统、Planner 或 tool_call_id。"
  ].join("\n");
}

export function toolResultPrompt(result: ToolResult) {
  return [
    `tool_call_id: ${result.toolCallId}`,
    "外部动作完成：",
    `- action: ${result.tool}`,
    `- status: ${result.status}`,
    `- result: ${result.summary}`,
    `- visible_result: ${result.visibleResult}`,
    "这是你的外部身体动作结果。",
    "请用第一人称自然简短告诉用户结果。",
    "不要提到后端、系统、Planner 或 tool_call_id。"
  ].join("\n");
}

export function clarificationPrompt(decision: Extract<PlannerDecision, { action: "ask_clarification" }>) {
  return [
    `你现在缺少这些信息：${decision.missing.join(", ")}。`,
    `请自然向用户确认：“${decision.question}”`,
    "不要提到后端、系统或 Planner。"
  ].join("\n");
}

function normalize(text: string) {
  return text.replace(/\s+/g, "").replace(/[，。！？,.!?]/g, "");
}

function extractDestination(text: string) {
  return extractPlace(text, ["设置终点", "终点设为", "终点设置为", "导航到", "带我去", "去"]);
}

function extractPlace(text: string, markers: string[]) {
  for (const marker of markers) {
    const index = text.indexOf(marker);
    if (index < 0) continue;
    const value = text.slice(index + marker.length).replace(/^(到|为|去)/, "");
    const place = value.slice(0, 24);
    if (place) return place;
  }
  return "";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
