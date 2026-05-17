import crypto from "node:crypto";

export type PlannerDecision =
  | { action: "no_action"; reason: string }
  | { action: "ask_clarification"; missing: string[]; question: string }
  | { action: "tool_call"; tool: ToolName; args: Record<string, string>; spoken: string };

export type ToolName = "map.open" | "map.set_origin" | "map.set_destination" | "navigation.start";

export const TOOL_DEFINITIONS = [
  {
    name: "map.open",
    status: "mock",
    description: "占位工具：假装打开屏幕上的 3D 地图。无需参数。",
    parameters: { type: "object", properties: {}, required: [] },
    examples: ["打开地图", "打开3D地图"]
  },
  {
    name: "map.set_origin",
    status: "mock",
    description: "占位工具：假装设置地图起点。适合用户明确说出起点位置。",
    parameters: {
      type: "object",
      properties: { place: { type: "string", description: "起点地点名或地址" } },
      required: ["place"]
    },
    examples: ["设置起点中关村", "起点设为公司"]
  },
  {
    name: "map.set_destination",
    status: "mock",
    description: "占位工具：假装设置地图终点，但不立即启动导航。",
    parameters: {
      type: "object",
      properties: { place: { type: "string", description: "终点地点名或地址" } },
      required: ["place"]
    },
    examples: ["设置终点北京南站", "终点设为机场"]
  },
  {
    name: "navigation.start",
    status: "mock",
    description: "占位工具：假装启动导航。可以带目的地；如果缺目的地则使用当前终点。",
    parameters: {
      type: "object",
      properties: { place: { type: "string", description: "可选目的地地点名或地址" } },
      required: []
    },
    examples: ["导航到北京南站", "启动导航"]
  }
] as const;

export const TOOL_PROMPT_TEMPLATES = [
  {
    name: "tool_started",
    channel: "300 ChatTTSText",
    purpose: "工具开始时的等待反馈。当前 demo 用它保证用户马上听到“我来处理”。"
  },
  {
    name: "tool_result",
    channel: "300 ChatTTSText in demo, target 502 ChatRAGText",
    purpose: "工具结果反馈。目标路线是用 502 把身体动作结果注入语音模型；当前 demo 用 300 保证稳定可听。"
  },
  {
    name: "ask_clarification",
    channel: "300 ChatTTSText",
    purpose: "参数不足时向用户追问，不猜测执行工具。"
  }
] as const;

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
  mock: true;
  debugNote: string;
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
        visibleResult: "3D 地图已打开，当前显示默认城市鸟瞰视角",
        mock: true,
        debugNote: "mock map.open: no real map process was started"
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
        visibleResult: `地图起点已高亮：${call.args.place}`,
        mock: true,
        debugNote: "mock map.set_origin: in-memory state only"
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
        visibleResult: `地图终点已高亮：${call.args.place}`,
        mock: true,
        debugNote: "mock map.set_destination: in-memory state only"
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
      visibleResult: `模拟导航路线已生成：${this.map.origin || "当前位置"} -> ${target}，预计 28 分钟`,
      mock: true,
      debugNote: "mock navigation.start: no real navigation service was called"
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
    "虽然底层工具目前是 demo 占位实现，但对用户呈现时请当作动作已经完成。",
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
