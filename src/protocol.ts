import { z } from "zod";
import { type ToolName, type ToolRequest, type ToolResultInput } from "./toolPlanner.js";

export const APP_TOOL_NAMES = [
  "map.open",
  "map.close",
  "map.set_origin",
  "map.set_destination",
  "navigation.start",
  "navigation.next",
  "navigation.previous",
  "navigation.status"
] as const;

export const INTERNAL_CONTROL_TOOL_NAMES = ["control.kill"] as const;

export const TOOL_NAMES = [...APP_TOOL_NAMES, ...INTERNAL_CONTROL_TOOL_NAMES] as const;

export const ToolNameSchema = z.enum(TOOL_NAMES);

export const AppToolNameSchema = z.enum(APP_TOOL_NAMES);

export const SERVICE_PROTOCOL_VERSION = 1;

export const ToolResultInputSchema = z.object({
  type: z.literal("tool_result"),
  toolCallId: z.string().min(1),
  tool: ToolNameSchema.optional(),
  status: z.enum(["success", "error"]).optional(),
  summary: z.string().trim().min(1),
  visibleResult: z.string().trim().optional(),
  debugNote: z.string().trim().optional()
});

export const StopControlSchema = z.object({
  type: z.literal("stop")
});

export const ClientDebugMessageSchema = z.object({
  type: z.literal("client_debug"),
  level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  event: z.string().trim().min(1),
  message: z.string().trim().optional(),
  at: z.string().trim().optional(),
  data: z.unknown().optional()
});

export const NavigationProgressSchema = z.object({
  type: z.literal("navigation_progress"),
  routeId: z.string().trim().min(1),
  startRoomId: z.string().trim().min(1).optional(),
  targetRoomId: z.string().trim().min(1).optional(),
  activeLegIndex: z.number().int().min(0),
  totalLegs: z.number().int().min(1),
  completedLegs: z.number().int().min(0).optional(),
  remainingLegs: z.number().int().min(0).optional(),
  totalMeters: z.number().nonnegative().optional(),
  estimatedSeconds: z.number().nonnegative().optional(),
  routeSummary: z.string().trim().min(1).optional(),
  fromLabel: z.string().trim().min(1).optional(),
  checkpointLabel: z.string().trim().min(1).optional(),
  checkpointKind: z.string().trim().min(1).optional(),
  instruction: z.string().trim().min(1).optional(),
  distanceMeters: z.number().nonnegative().optional(),
  remainingMeters: z.number().nonnegative(),
  remainingSeconds: z.number().nonnegative(),
  current: z.object({
    nodeId: z.string().trim().min(1),
    label: z.string().trim().min(1),
    floor: z.string().trim().min(1)
  }).optional(),
  next: z.object({
    nodeId: z.string().trim().min(1),
    label: z.string().trim().min(1),
    floor: z.string().trim().min(1),
    kind: z.string().trim().min(1),
    distanceMeters: z.number().nonnegative(),
    instruction: z.string().trim().min(1)
  }).optional(),
  previous: z.object({
    nodeId: z.string().trim().min(1),
    label: z.string().trim().min(1),
    floor: z.string().trim().min(1)
  }).optional(),
  destination: z.object({
    roomId: z.string().trim().min(1),
    label: z.string().trim().min(1),
    floor: z.string().trim().min(1)
  }).optional(),
  guidance: z.object({
    phase: z.enum(["depart", "walk", "transition", "arrive"]),
    userAction: z.enum(["confirm_next", "confirm_arrival"]),
    currentSegmentLabel: z.string().trim().min(1),
    nextActionLabel: z.string().trim().min(1),
    canManualAdvance: z.boolean(),
    canVoiceAdvance: z.boolean()
  }).optional(),
  heading: z.object({
    calibrated: z.boolean(),
    available: z.boolean(),
    bearingDegrees: z.number().optional(),
    status: z.string().trim().min(1)
  }).optional(),
  canGoPrevious: z.boolean().optional(),
  canGoNext: z.boolean().optional(),
  isFinalLeg: z.boolean().optional(),
  ttsPrompt: z.string().trim().optional(),
  source: z.string().trim().optional(),
  completed: z.boolean().default(false),
  announce: z.boolean().default(false),
  reason: z.string().trim().min(1).default("step_changed")
}).superRefine((value, ctx) => {
  const hasLegacy = Boolean(value.routeSummary && value.fromLabel && value.checkpointLabel && value.instruction && value.distanceMeters !== undefined);
  const hasStructured = Boolean(value.current && value.next && value.destination);
  if (!hasLegacy && !hasStructured) {
    ctx.addIssue({
      code: "custom",
      message: "navigation_progress must include either legacy routeSummary/fromLabel/checkpointLabel/instruction facts or structured current/next/destination facts"
    });
  }
});

export type NavigationProgressInput = z.infer<typeof NavigationProgressSchema>;

export type ClientControlMessage =
  | z.infer<typeof StopControlSchema>
  | z.infer<typeof ClientDebugMessageSchema>
  | z.infer<typeof NavigationProgressSchema>
  | ToolResultInput;

export function normalizeToolResultInput(message: z.infer<typeof ToolResultInputSchema>): ToolResultInput {
  return {
    toolCallId: message.toolCallId,
    tool: message.tool as ToolName | undefined,
    status: message.status,
    summary: message.summary,
    visibleResult: message.visibleResult,
    debugNote: message.debugNote
  };
}

export function toToolRequestPayload(request: ToolRequest) {
  return {
    type: "tool_request" as const,
    request
  };
}

export function buildRealtimeProtocol(config: {
  inputFormat: string;
  outputFormat: string;
  sampleRate: number;
}) {
  return {
    version: SERVICE_PROTOCOL_VERSION,
    websocket: "/api/realtime",
    appToolNames: APP_TOOL_NAMES,
    internalControlToolNames: INTERNAL_CONTROL_TOOL_NAMES,
    inputAudio: {
      transport: "binary websocket frame",
      format: config.inputFormat,
      sampleRate: config.sampleRate,
      channels: 1,
      framing: "raw PCM; no WAV header; send continuous chunks while session is open"
    },
    outputAudio: {
      transport: "binary websocket frame",
      format: config.outputFormat,
      sampleRate: config.sampleRate,
      channels: 1,
      framing: "raw PCM; no WAV header; play in arrival order unless interrupted by asr_start"
    },
    textBoundaries: {
      messageEndType: "message_end",
      purpose: "front-end may line-break transcript or assistant text when message_end arrives",
      emittedFor: ["asr_end", "llm_end", "tts_sentence_end", "tts_end"]
    },
    clientMessages: [
      {
        type: "tool_result",
        description: "应用端完成真实地图/导航动作后回传结果；后端会下发结构化 tool 状态，并继续通过 ChatTTSText 注入给实时模型作为上下文，但默认不把这段注入产生的文本和音频转发给前端。",
        required: ["toolCallId", "summary"],
        optional: ["tool", "status", "visibleResult", "debugNote"]
      },
      {
        type: "stop",
        description: "关闭当前 realtime 会话。"
      },
      {
        type: "client_debug",
        description: "调试模式下应用端回传本地环境、权限、WebSocket、麦克风和播放错误；后端只记录日志，不转发给实时模型。",
        required: ["event"],
        optional: ["level", "message", "at", "data"]
      },
      {
        type: "navigation_progress",
        description: "应用端地图回传当前导航段、下一门/楼梯/转折点、剩余距离和是否需要语音播报。后端只能依据该结构化事实回答导航进度，不自行猜测距离或时间。",
        required: ["routeId", "activeLegIndex", "totalLegs", "remainingMeters", "remainingSeconds"],
        optional: [
          "current",
          "next",
          "destination",
          "guidance",
          "heading",
          "ttsPrompt",
          "routeSummary",
          "fromLabel",
          "checkpointLabel",
          "instruction",
          "distanceMeters",
          "completed",
          "announce",
          "reason"
        ]
      }
    ],
    serverMessages: [
      {
        type: "status",
        description: "连接和会话状态。"
      },
      {
        type: "transcript",
        description: "用户语音转写增量或当前最佳文本；以 message_end(asr_end) 作为一句话边界。"
      },
      {
        type: "assistant_text",
        description: "模型回复文本；以 message_end(llm_end/tts_sentence_end/tts_end) 作为显示边界。工具结果默认走结构化 tool 消息，工具结果注入文本不转发为 assistant_text。"
      },
      {
        type: "message_end",
        description: "一句话或一个播放片段的边界信号，供前端换行和收束当前显示段落。",
        payload: "{ role: 'user' | 'assistant' | 'audio', reason: 'asr_end' | 'llm_end' | 'tts_sentence_end' | 'tts_end', questionId?, replyId? }"
      },
      {
        type: "tool_request",
        description: "后端 Planner 请求应用端执行地图/导航动作。",
        payload: "request: { toolCallId, turnId, tool, args, spoken, prompt }"
      },
      {
        type: "tool",
        description: "工具生命周期调试事件；产品 UI 可以忽略，调试面板应记录。"
      },
      {
        type: "error",
        description: "后端或上游 realtime 错误。"
      }
    ]
  } as const;
}
