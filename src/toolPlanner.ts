import crypto from "node:crypto";
import { TOOL_NAMES } from "./protocol.js";

export type PlannerDecision =
  | { action: "no_action"; reason: string }
  | { action: "ask_clarification"; missing: string[]; question: string }
  | { action: "tool_call"; tool: ToolName; args: Record<string, string>; spoken: string };

export type ToolName = (typeof TOOL_NAMES)[number];

export const TOOL_DEFINITIONS = [
  {
    name: "map.open",
    status: "bridge",
    description: "打开地图界面。无需参数。",
    parameters: { type: "object", properties: {}, required: [] },
    examples: ["打开地图", "打开3D地图"]
  },
  {
    name: "map.close",
    status: "bridge",
    description: "关闭地图界面。无需参数。",
    parameters: { type: "object", properties: {}, required: [] },
    examples: ["关闭地图", "收起地图"]
  },
  {
    name: "map.set_origin",
    status: "bridge",
    description: "设置地图起点。适合用户明确说出起点位置。",
    parameters: {
      type: "object",
      properties: { place: { type: "string", description: "起点地点名或地址" } },
      required: ["place"]
    },
    examples: ["设置起点中关村", "起点设为公司"]
  },
  {
    name: "map.set_destination",
    status: "bridge",
    description: "设置地图终点，但不立即启动导航。",
    parameters: {
      type: "object",
      properties: { place: { type: "string", description: "终点地点名或地址" } },
      required: ["place"]
    },
    examples: ["设置终点北京南站", "终点设为机场"]
  },
  {
    name: "navigation.start",
    status: "bridge",
    description: "启动导航。可以带目的地；如果缺目的地则使用当前终点。",
    parameters: {
      type: "object",
      properties: { place: { type: "string", description: "可选目的地地点名或地址" } },
      required: []
    },
    examples: ["导航到北京南站", "启动导航"]
  },
  {
    name: "control.kill",
    status: "bridge",
    description: "取消当前正在执行的工具调用。无需参数。",
    parameters: { type: "object", properties: {}, required: [] },
    examples: ["取消当前工具调用"]
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
  status: "success" | "error";
  summary: string;
  visibleResult: string;
  origin: "client" | "fallback";
  debugNote: string;
};

export type ToolRequest = {
  toolCallId: string;
  turnId: string;
  tool: ToolName;
  args: Record<string, string>;
  spoken: string;
  prompt: string;
};

export type ToolResultInput = {
  toolCallId: string;
  tool?: ToolName;
  status?: "success" | "error";
  summary: string;
  visibleResult?: string;
  debugNote?: string;
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

  plan(assistantResponse: string): PlannerDecision {
    return parseAssistantToolDeclaration(assistantResponse);
  }

  hasRunningCall() {
    return this.running.size > 0;
  }

  cancelRunningCall(): ToolResult {
    const call = this.running.values().next().value as ToolCallState | undefined;
    if (!call) {
      return {
        toolCallId: crypto.randomUUID(),
        tool: "control.kill",
        status: "success",
        summary: "当前没有正在执行的工具调用",
        visibleResult: "没有正在执行的工具调用",
        origin: "fallback",
        debugNote: "control.kill: no running tool call"
      };
    }
    call.superseded = true;
    call.status = "dropped";
    this.running.delete(call.toolCallId);
    return {
      toolCallId: call.toolCallId,
      tool: "control.kill",
      status: "success",
      summary: "刚才的工具调用已取消",
      visibleResult: `已取消 ${call.tool}`,
      origin: "fallback",
      debugNote: `control.kill: cancelled ${call.tool}`
    };
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
        origin: "fallback",
        debugNote: "fallback map.open: no real map process was started"
      };
    }

    if (call.tool === "map.close") {
      this.map.opened = false;
      this.map.navigating = false;
      return {
        toolCallId: call.toolCallId,
        tool: call.tool,
        status: "success",
        summary: "地图已关闭",
        visibleResult: "地图界面已关闭",
        origin: "fallback",
        debugNote: "fallback map.close: no real map process was started"
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
        origin: "fallback",
        debugNote: "fallback map.set_origin: in-memory state only"
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
        origin: "fallback",
        debugNote: "fallback map.set_destination: in-memory state only"
      };
    }

    if (call.tool === "control.kill") {
      return {
        toolCallId: call.toolCallId,
        tool: call.tool,
        status: "success",
        summary: "当前没有正在执行的工具调用",
        visibleResult: "没有正在执行的工具调用",
        origin: "fallback",
        debugNote: "fallback control.kill: no running tool call"
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
      origin: "fallback",
      debugNote: "fallback navigation.start: no real navigation service was called"
    };
  }

  resolve(toolCall: ToolCallState, result: ToolResultInput): ToolResult {
    toolCall.status = "completed";
    this.running.delete(toolCall.toolCallId);
    return {
      toolCallId: result.toolCallId,
      tool: result.tool || toolCall.tool,
      status: result.status || "success",
      summary: result.summary,
      visibleResult: result.visibleResult || result.summary,
      origin: "client",
      debugNote: result.debugNote || "client tool result"
    };
  }
}

export function parseAssistantToolDeclaration(assistantResponse: string): PlannerDecision {
  const text = normalizeDeclaration(assistantResponse);
  if (!text) return { action: "no_action", reason: "empty assistant response" };

  if (text === "我来调用地图工具:打开地图") {
    return { action: "tool_call", tool: "map.open", args: {}, spoken: "我来调用地图工具：打开地图。" };
  }

  if (text === "我来调用地图工具:关闭地图") {
    return { action: "tool_call", tool: "map.close", args: {}, spoken: "我来调用地图工具：关闭地图。" };
  }

  const origin = exactValue(text, "我来调用地图工具:设置起点为");
  if (origin) {
    return {
      action: "tool_call",
      tool: "map.set_origin",
      args: { place: origin },
      spoken: `我来调用地图工具：设置起点为${origin}。`
    };
  }

  const destination = exactValue(text, "我来调用地图工具:设置终点为");
  if (destination) {
    return {
      action: "tool_call",
      tool: "map.set_destination",
      args: { place: destination },
      spoken: `我来调用地图工具：设置终点为${destination}。`
    };
  }

  const navigationTarget = exactValue(text, "我来调用导航工具:导航到");
  if (navigationTarget) {
    return {
      action: "tool_call",
      tool: "navigation.start",
      args: { place: navigationTarget },
      spoken: `我来调用导航工具：导航到${navigationTarget}。`
    };
  }

  if (text === "我来调用导航工具:开始导航") {
    return { action: "tool_call", tool: "navigation.start", args: {}, spoken: "我来调用导航工具：开始导航。" };
  }

  if (text === "我来调用控制工具:取消当前工具调用") {
    return { action: "tool_call", tool: "control.kill", args: {}, spoken: "我来调用控制工具：取消当前工具调用。" };
  }

  return { action: "no_action", reason: "assistant response did not match tool declaration grammar" };
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

function normalizeDeclaration(text: string) {
  return text.replace(/\s+/g, "").replace(/：/g, ":").replace(/[。！？,.!?]+$/g, "");
}

function exactValue(text: string, prefix: string) {
  if (!text.startsWith(prefix)) return "";
  const value = text.slice(prefix.length);
  if (!value || value.includes(":")) return "";
  return value.slice(0, 40);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
