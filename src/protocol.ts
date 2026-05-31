import { z } from "zod";
import { TOOL_NAMES, type ToolName, type ToolRequest, type ToolResultInput } from "./toolPlanner.js";

export const ToolNameSchema = z.enum(TOOL_NAMES);

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

export type ClientControlMessage =
  | z.infer<typeof StopControlSchema>
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
