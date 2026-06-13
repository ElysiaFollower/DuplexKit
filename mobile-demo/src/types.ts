export type AppToolName =
  | "map.open"
  | "map.close"
  | "map.set_origin"
  | "map.set_destination"
  | "navigation.start";

export type ToolRequest = {
  toolCallId: string;
  turnId?: string;
  tool: AppToolName;
  args?: {
    place?: string;
  };
  spoken?: string;
  prompt?: string;
};

export type RealtimeMessage =
  | { type: "status"; state?: string }
  | { type: "error"; message?: string }
  | { type: "asr_start"; questionId?: string }
  | { type: "transcript"; text?: string; questionId?: string }
  | { type: "asr_end"; questionId?: string }
  | { type: "assistant_text"; text?: string; append?: boolean; source?: string }
  | { type: "message_end"; role?: "user" | "assistant" | "audio"; reason?: string; questionId?: string; replyId?: string }
  | { type: "tts_start"; suppressed?: boolean }
  | { type: "tts_end" }
  | { type: "llm_end" }
  | { type: "tool_request"; request?: ToolRequest }
  | { type: "tool"; status?: string; tool?: string; summary?: string; visibleResult?: string }
  | { type: "raw_event"; event?: number; eventName?: string };

export type DialogueTurn = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  final: boolean;
};

export type MapDemoState = {
  visible: boolean;
  origin?: string;
  destination?: string;
  navigating: boolean;
  lastTool?: string;
  lastResult?: string;
};

export function isRealtimeMessage(value: unknown): value is RealtimeMessage {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}
