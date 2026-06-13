import crypto from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type { RawData, WebSocket as ClientSocket } from "ws";
import WebSocket from "ws";
import { appendClientDebugLog } from "./clientDebugLogs.js";
import type { AppConfig } from "./config.js";
import { appendRealtimeTraceLog, realtimeTraceLogPath, type RealtimeTraceDirection } from "./realtimeTraceLogs.js";
import { getRuntimeSettings } from "./runtimeSettings.js";
import {
  DemoToolRuntime,
  type ToolCallState,
  type ToolRequest,
  type ToolResult,
  toolResultPrompt,
  type ToolResultInput
} from "./toolPlanner.js";
import {
  ClientDebugMessageSchema,
  normalizeToolResultInput,
  StopControlSchema,
  ToolResultInputSchema,
  toToolRequestPayload
} from "./protocol.js";

type RealtimeConfig = AppConfig["realtime"];
type ByteBuffer = Buffer<ArrayBufferLike>;
type PendingToolInvocation = {
  call: ToolCallState;
  timeout: ReturnType<typeof setTimeout>;
  state: "waiting" | "resolved" | "timed_out";
};

const activeBridges = new Map<string, VolcRealtimeBridge>();
let latestBridgeId = "";

export function listRealtimeDebugSessions() {
  return [...activeBridges.values()].map((bridge) => bridge.debugInfo());
}

export async function injectRealtimeDebugAudio(pcm: ByteBuffer, options: { frameBytes?: number; frameMs?: number; silenceMs?: number } = {}) {
  const bridge = latestBridgeId ? activeBridges.get(latestBridgeId) : undefined;
  if (!bridge) return { ok: false as const, error: "No active realtime app session" };
  await bridge.injectAudio(pcm, options);
  return { ok: true as const, session: bridge.debugInfo(), bytes: pcm.length };
}

const events = {
  startConnection: 1,
  finishConnection: 2,
  startSession: 100,
  finishSession: 102,
  audio: 200,
  chatTtsText: 300,
  chatRagText: 502,
  asrStart: 450,
  asrResponse: 451,
  asrEnd: 459,
  ttsStart: 350,
  ttsResponse: 352,
  ttsSentenceEnd: 351,
  ttsEnd: 359,
  llmText: 550,
  llmTextEnd: 559
} as const;

const eventNames = new Map<number, string>([
  [50, "ConnectionStarted"],
  [51, "ConnectionFailed"],
  [52, "ConnectionFinished"],
  [150, "SessionStarted"],
  [152, "SessionFinished"],
  [153, "SessionFailed"],
  [154, "UsageResponse"],
  [251, "ConfigUpdated"],
  [300, "ChatTTSText"],
  [350, "TTSSentenceStart"],
  [351, "TTSSentenceEnd"],
  [352, "TTSResponse"],
  [359, "TTSEnded"],
  [450, "ASRInfo"],
  [451, "ASRResponse"],
  [459, "ASREnded"],
  [502, "ChatRAGText"],
  [550, "ChatResponse"],
  [553, "ChatTextQueryConfirmed"],
  [559, "ChatEnded"],
  [599, "DialogCommonError"]
]);

export function attachVolcRealtimeBridge(client: ClientSocket, config: RealtimeConfig) {
  if (!config.appId || !config.accessToken) {
    client.send(JSON.stringify({ type: "error", message: "Missing realtime APP_ID/ACCESS_TOKEN" }));
    client.close();
    return;
  }

  const bridge = new VolcRealtimeBridge(client, config);

  client.on("message", (data, isBinary) => {
    if (isBinary) {
      bridge.sendAudio(toBuffer(data));
      return;
    }
    bridge.handleClientControl(toBuffer(data).toString("utf8"));
  });

  client.on("close", () => bridge.close());
  client.on("error", () => bridge.close());
}

class VolcRealtimeBridge {
  private readonly sessionId = crypto.randomUUID();
  private readonly upstream: WebSocket;
  private readonly queuedAudio: ByteBuffer[] = [];
  private connectionStarted = false;
  private sessionStarted = false;
  private closed = false;
  private text = "";
  private readonly tools = new DemoToolRuntime();
  private latestTranscript = "";
  private currentQuestionId = "";
  private currentAudioAllowed = true;
  private pendingToolCalls = new Map<string, PendingToolInvocation>();

  constructor(private readonly client: ClientSocket, private readonly config: RealtimeConfig) {
    activeBridges.set(this.sessionId, this);
    latestBridgeId = this.sessionId;

    this.upstream = new WebSocket(config.endpoint, {
      headers: {
        "X-Api-App-ID": config.appId,
        "X-Api-Access-Key": config.accessToken,
        "X-Api-Resource-Id": config.resourceId,
        "X-Api-App-Key": config.appKey,
        "X-Api-Connect-Id": crypto.randomUUID()
      }
    });

    this.upstream.on("open", () => {
      this.trace("server_to_upstream", "connection.start", {
        endpoint: config.endpoint,
        resourceId: config.resourceId,
        inputFormat: config.inputFormat,
        outputFormat: config.outputFormat,
        sampleRate: config.sampleRate
      });
      this.sendJson({
        type: "status",
        state: "connecting-realtime",
        inputFormat: config.inputFormat,
        outputFormat: config.outputFormat,
        sampleRate: config.sampleRate
      });
      this.upstream.send(packet(events.startConnection, {}));
    });
    this.upstream.on("message", (data) => this.handleUpstreamMessage(toBuffer(data)));
    this.upstream.on("error", (error) => this.fail(error instanceof Error ? error.message : String(error)));
    this.upstream.on("close", () => {
      this.trace("upstream_to_server", "connection.closed");
      if (!this.closed) this.sendJson({ type: "status", state: "realtime-closed" });
      this.closed = true;
    });
    this.trace("internal", "bridge.created", { traceFile: realtimeTraceLogPath() });
  }

  sendAudio(pcm: ByteBuffer) {
    if (this.closed || pcm.length === 0) return;
    if (!this.sessionStarted) {
      this.queuedAudio.push(pcm);
      if (this.queuedAudio.length > 100) this.queuedAudio.shift();
      return;
    }
    this.upstream.send(audioPacket(pcm, this.sessionId));
  }

  handleClientControl(raw: string) {
    try {
      const message = JSON.parse(raw) as { type?: string };
      const stop = StopControlSchema.safeParse(message);
      if (stop.success) {
        this.trace("client_to_server", "control.stop");
        this.close();
        return;
      }

      const toolResult = ToolResultInputSchema.safeParse(message);
      if (toolResult.success) {
        this.trace("client_to_server", "tool_result", toolResult.data);
        this.handleToolResult(normalizeToolResultInput(toolResult.data));
        return;
      }

      const clientDebug = ClientDebugMessageSchema.safeParse(message);
      if (clientDebug.success) {
        this.handleClientDebug(clientDebug.data);
        return;
      }

      this.trace("client_to_server", "control.invalid", { raw });
      this.sendJson({ type: "error", message: "Invalid client control message" });
    } catch {
      this.trace("client_to_server", "control.invalid_json", { raw });
      this.sendJson({ type: "error", message: "Invalid client control message" });
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    activeBridges.delete(this.sessionId);
    if (latestBridgeId === this.sessionId) latestBridgeId = [...activeBridges.keys()].at(-1) || "";
    for (const pending of this.pendingToolCalls.values()) clearTimeout(pending.timeout);
    this.pendingToolCalls.clear();
    this.trace("internal", "bridge.closed");
    if (this.upstream.readyState === WebSocket.OPEN) {
      this.upstream.send(packet(events.finishSession, {}, this.sessionId));
      this.upstream.send(packet(events.finishConnection, {}));
    }
    this.upstream.close();
  }

  debugInfo() {
    return {
      sessionId: this.sessionId,
      connectionStarted: this.connectionStarted,
      sessionStarted: this.sessionStarted,
      closed: this.closed,
      queuedAudioFrames: this.queuedAudio.length,
      traceFile: realtimeTraceLogPath()
    };
  }

  async injectAudio(pcm: ByteBuffer, options: { frameBytes?: number; frameMs?: number; silenceMs?: number } = {}) {
    const frameBytes = options.frameBytes ?? 4800;
    const frameMs = options.frameMs ?? 100;
    const silenceMs = options.silenceMs ?? 1000;
    for (let offset = 0; offset < pcm.length; offset += frameBytes) {
      this.sendAudio(pcm.subarray(offset, Math.min(pcm.length, offset + frameBytes)));
      await delay(frameMs);
    }
    const silenceFrames = Math.max(0, Math.ceil(silenceMs / frameMs));
    const silence = Buffer.alloc(frameBytes);
    for (let i = 0; i < silenceFrames; i += 1) {
      this.sendAudio(silence);
      await delay(frameMs);
    }
  }

  private handleUpstreamMessage(data: Buffer) {
    const parsed = parseResponse(data);
    if (parsed.error) {
      this.trace("upstream_to_server", "upstream.error", { code: parsed.code, payload: parsed.payload });
      this.fail(`Volcengine error ${parsed.code}: ${parsed.payload}`);
      return;
    }
    if (!this.connectionStarted) {
      this.connectionStarted = true;
      const runtimeSettings = getRuntimeSettings();
      this.trace("upstream_to_server", "connection.started", {
        event: parsed.event,
        eventName: parsed.event ? eventNames.get(parsed.event) : undefined
      });
      this.trace("server_to_upstream", "session.start", {
        speaker: this.config.speaker,
        speakingStyle: runtimeSettings.speakingStyle
      });
      this.sendJson({ type: "status", state: "starting-session" });
      this.upstream.send(
        packet(
          events.startSession,
          {
            tts: {
              audio_config: { channel: 1, format: "pcm", sample_rate: this.config.sampleRate },
              speaker: this.config.speaker
            },
            dialog: {
              bot_name: "豆包",
              system_role: runtimeSettings.systemRole,
              dialog_id: this.sessionId,
              speaking_style: runtimeSettings.speakingStyle,
              extra: { strict_audit: false, model: "1.2.1.1" }
            }
          },
          this.sessionId
        )
      );
      return;
    }

    if (this.connectionStarted && !this.sessionStarted) {
      this.sessionStarted = true;
      this.trace("upstream_to_server", "session.started", {
        event: parsed.event,
        eventName: parsed.event ? eventNames.get(parsed.event) : undefined
      });
      this.sendJson({ type: "status", state: "listening" });
      for (const pcm of this.queuedAudio.splice(0)) this.sendAudio(pcm);
      return;
    }

    this.forwardEvent(parsed);
  }

  private forwardEvent(parsed: ParsedSuccess) {
    this.forwardRawEvent(parsed);

    if (parsed.event === events.asrStart) {
      this.latestTranscript = "";
      this.text = "";
      this.currentQuestionId = extractId(parsed.payload, "question_id") || crypto.randomUUID();
      this.currentAudioAllowed = true;
      this.trace("upstream_to_server", "asr.start", { questionId: this.currentQuestionId });
      this.sendJson({ type: "asr_start", questionId: this.currentQuestionId });
    }
    if (parsed.event === events.asrEnd) {
      this.sendJson({ type: "message_end", role: "user", reason: "asr_end", questionId: this.currentQuestionId });
      this.sendJson({ type: "asr_end", questionId: this.currentQuestionId });
    }
    if (parsed.event === events.ttsStart) {
      const ttsType = extractId(parsed.payload, "tts_type");
      this.currentAudioAllowed = true;
      this.sendJson({
        type: "tts_start",
        replyId: extractId(parsed.payload, "reply_id"),
        ttsType,
        suppressed: !this.currentAudioAllowed
      });
    }
    if (parsed.event === events.ttsSentenceEnd) {
      this.sendJson({ type: "message_end", role: "assistant", reason: "tts_sentence_end" });
      this.sendJson({ type: "tts_sentence_end" });
    }
    if (parsed.event === events.ttsEnd) {
      this.sendJson({ type: "message_end", role: "audio", reason: "tts_end" });
      this.sendJson({ type: "tts_end" });
    }
    if (parsed.event === events.llmTextEnd) {
      const assistantResponse = this.text.trim();
      this.text = "";
      this.sendJson({ type: "message_end", role: "assistant", reason: "llm_end" });
      this.sendJson({ type: "llm_end" });
      void this.runPlanner(assistantResponse);
    }

    if (parsed.event === events.asrResponse) {
      const transcript = extractTranscript(parsed.payload);
      if (transcript) {
        this.latestTranscript = transcript;
        this.trace("upstream_to_server", "asr.transcript", { questionId: this.currentQuestionId, text: transcript });
        this.sendJson({ type: "transcript", text: transcript, questionId: this.currentQuestionId });
      }
    }

    if (parsed.event === events.llmText) {
      const delta = extractTextDelta(parsed.payload);
      if (delta && this.currentAudioAllowed) {
        this.text += delta;
        this.trace("upstream_to_server", "assistant.delta", { delta, text: this.text });
        this.sendJson({ type: "assistant_text", delta, text: this.text });
      }
    }

    if (parsed.event === events.ttsResponse && parsed.rawPayload.length > 0 && this.currentAudioAllowed) {
      this.trace("upstream_to_server", "audio.output_chunk", { bytes: parsed.rawPayload.length });
      this.client.send(parsed.rawPayload, { binary: true });
    }
  }

  private async runPlanner(assistantResponse: string) {
    const turnId = this.currentQuestionId || crypto.randomUUID();
    const decision = this.tools.plan(assistantResponse);
    this.trace("internal", "planner.decision", { turnId, assistantResponse, decision });
    this.sendJson({ type: "planner", source: "assistant_response", assistantResponse, decision });

    if (decision.action !== "tool_call") return;

    if (decision.tool === "control.kill") {
      this.resolveControlKill();
      return;
    }

    if (this.tools.hasRunningCall() || this.pendingToolCalls.size > 0) {
      this.sendJson({ type: "tool", phase: "rejected", reason: "tool_pending", decision });
      this.sendChatTtsText("上个工具调用尚未结束，请稍后。", "tool_rejected");
      return;
    }

    const call = this.tools.start(turnId, decision);
    const request = this.buildToolRequest(call, decision.spoken);
    const timeout = setTimeout(() => void this.resolvePendingToolCall(call.toolCallId), 1800);
    this.pendingToolCalls.set(call.toolCallId, { call, timeout, state: "waiting" });
    this.trace("internal", "tool.started", { call, request });
    this.sendJson({ type: "tool", phase: "started", call });
    this.sendJson(toToolRequestPayload(request));
  }

  private handleToolResult(result: ToolResultInput) {
    const pending = this.pendingToolCalls.get(result.toolCallId);
    if (!pending) {
      this.trace("internal", "tool.orphan_result", { result });
      this.sendJson({ type: "tool", phase: "orphan_result", result });
      return;
    }
    if (pending.state !== "waiting") {
      return;
    }
    clearTimeout(pending.timeout);
    pending.state = "resolved";
    this.pendingToolCalls.delete(result.toolCallId);
    const normalized = this.tools.resolve(pending.call, result);
    this.trace("internal", "tool.resolved", { result: normalized });
    this.finalizeToolResult(normalized);
  }

  private handleClientDebug(message: {
    level: "debug" | "info" | "warn" | "error";
    event: string;
    message?: string;
    at?: string;
    data?: unknown;
  }) {
    const payload = {
      sessionId: this.sessionId,
      at: message.at || new Date().toISOString(),
      level: message.level,
      event: message.event,
      message: message.message,
      data: message.data
    };
    const line = `[client_debug] ${JSON.stringify(payload)}`;
    if (message.level === "error") console.error(line);
    else if (message.level === "warn") console.warn(line);
    else console.info(line);
    appendClientDebugLog(payload).catch((error: unknown) => {
      console.warn(`[client_debug_log_failed] ${error instanceof Error ? error.message : String(error)}`);
    });
    this.trace("client_to_server", "client_debug", payload);
  }

  private async resolvePendingToolCall(toolCallId: string) {
    const pending = this.pendingToolCalls.get(toolCallId);
    if (!pending || pending.state !== "waiting" || this.closed) return;
    pending.state = "timed_out";
    const result = await this.tools.execute(toolCallId);
    if (!result) {
      this.pendingToolCalls.delete(toolCallId);
      this.trace("internal", "tool.dropped", { toolCallId });
      this.sendJson({ type: "tool", phase: "dropped", toolCallId });
      return;
    }
    if (pending.state !== "timed_out") return;
    this.pendingToolCalls.delete(toolCallId);
    pending.state = "resolved";
    this.trace("internal", "tool.timeout_fallback_resolved", { result });
    this.finalizeToolResult(result);
  }

  private resolveControlKill() {
    for (const pending of this.pendingToolCalls.values()) {
      clearTimeout(pending.timeout);
      pending.state = "resolved";
    }
    this.pendingToolCalls.clear();
    const result = this.tools.cancelRunningCall();
    this.trace("internal", "tool.control_kill", { result });
    this.sendJson({ type: "tool", phase: "result", result });
    this.sendChatTtsText(`${result.summary}。`, "tool_result");
  }

  private finalizeToolResult(result: ToolResult) {
    this.trace("internal", "tool.finalize_result", { result });
    this.sendJson({ type: "tool", phase: "result", result });
    this.sendJson({ type: "tool", phase: "result_prompt", prompt: toolResultPrompt(result) });
    this.sendChatTtsText(`刚才的工具调用结果出来了，${result.summary}。`, "tool_result");
  }

  private buildToolRequest(call: ToolCallState, spoken: string): ToolRequest {
    return {
      toolCallId: call.toolCallId,
      turnId: call.turnId,
      tool: call.tool,
      args: call.args,
      spoken,
      prompt: ""
    };
  }

  private sendChatRagText(externalRag: string) {
    if (this.closed || this.upstream.readyState !== WebSocket.OPEN || !this.sessionStarted) return;
    this.trace("server_to_upstream", "chat_rag_text", { externalRag });
    this.upstream.send(packet(events.chatRagText, { external_rag: externalRag }, this.sessionId));
  }

  private sendChatTtsText(content: string, source = "server_chat_tts") {
    if (this.closed || this.upstream.readyState !== WebSocket.OPEN || !this.sessionStarted) return;
    this.trace("server_to_upstream", "chat_tts_text", { source, content });
    this.sendJson({ type: "assistant_text", text: content, source, append: true });
    this.upstream.send(packet(events.chatTtsText, { start: true, content, end: true }, this.sessionId));
  }

  private forwardRawEvent(parsed: ParsedSuccess) {
    const payload = parsed.payload as Record<string, unknown>;
    this.sendJson({
      type: "raw_event",
      event: parsed.event,
      eventName: parsed.event ? eventNames.get(parsed.event) || "Unknown" : "Unknown",
      questionId: typeof payload?.question_id === "string" ? payload.question_id : undefined,
      replyId: typeof payload?.reply_id === "string" ? payload.reply_id : undefined,
      ttsType: typeof payload?.tts_type === "string" ? payload.tts_type : undefined,
      content: typeof payload?.content === "string" ? payload.content : undefined,
      text: typeof payload?.text === "string" ? payload.text : undefined
    });
  }

  private fail(message: string) {
    this.trace("internal", "bridge.failed", { message });
    this.sendJson({ type: "error", message });
    this.close();
  }

  private sendJson(payload: unknown) {
    this.trace("server_to_client", "json", payload);
    if (this.client.readyState === WebSocket.OPEN) this.client.send(JSON.stringify(payload));
  }

  private trace(direction: RealtimeTraceDirection, event: string, payload?: unknown) {
    appendRealtimeTraceLog({
      sessionId: this.sessionId,
      at: new Date().toISOString(),
      direction,
      event,
      payload
    }).catch((error: unknown) => {
      console.warn(`[realtime_trace_log_failed] ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}

type ParsedResponse =
  | ParsedSuccess
  | { error: true; code: number; payload: string };
type ParsedSuccess = { event: number | null; payload: unknown; rawPayload: ByteBuffer; error?: false };

function packet(event: number, payload: unknown, sid?: string) {
  const payloadBytes = gzipSync(Buffer.from(JSON.stringify(payload)));
  const chunks = [Buffer.from([0x11, 0x14, 0x11, 0x00]), u32(event)];
  if (sid) chunks.push(u32(Buffer.byteLength(sid)), Buffer.from(sid));
  chunks.push(u32(payloadBytes.length), payloadBytes);
  return Buffer.concat(chunks);
}

function audioPacket(pcm: ByteBuffer, sid: string) {
  const payloadBytes = gzipSync(pcm);
  return Buffer.concat([
    Buffer.from([0x11, 0x24, 0x01, 0x00]),
    u32(events.audio),
    u32(Buffer.byteLength(sid)),
    Buffer.from(sid),
    u32(payloadBytes.length),
    payloadBytes
  ]);
}

function parseResponse(buffer: ByteBuffer): ParsedResponse {
  const headerSize = buffer[0] & 0x0f;
  const messageType = buffer[1] >> 4;
  const flags = buffer[1] & 0x0f;
  const serialization = buffer[2] >> 4;
  const compression = buffer[2] & 0x0f;
  let payload = buffer.subarray(headerSize * 4);
  let event: number | null = null;
  let rawPayload: ByteBuffer = Buffer.alloc(0);

  if (messageType === 0x0f) {
    const code = payload.readUInt32BE(0);
    const size = payload.readUInt32BE(4);
    const body = payload.subarray(8, 8 + size);
    return { error: true, code, payload: body.toString("utf8") };
  }

  if (flags & 0x04) {
    event = payload.readUInt32BE(0);
    payload = payload.subarray(4);
  }

  const sidLen = payload.readInt32BE(0);
  payload = payload.subarray(4 + sidLen);
  const payloadSize = payload.readUInt32BE(0);
  rawPayload = payload.subarray(4, 4 + payloadSize);

  let decoded: ByteBuffer = rawPayload;
  if (compression === 1 && rawPayload.length > 0) decoded = gunzipSync(rawPayload);
  if (serialization === 1 && decoded.length > 0) {
    return { event, payload: JSON.parse(decoded.toString("utf8")), rawPayload: decoded };
  }
  return { event, payload: decoded, rawPayload: decoded };
}

function extractTranscript(payload: unknown) {
  const value = payload as {
    results?: Array<{ text?: string; alternatives?: Array<{ text?: string }> }>;
    text?: string;
  };
  return value.results?.[0]?.text || value.results?.[0]?.alternatives?.[0]?.text || value.text || "";
}

function extractTextDelta(payload: unknown) {
  const value = payload as { content?: string; text?: string };
  return value.content || value.text || "";
}

function extractId(payload: unknown, key: string) {
  const value = payload as Record<string, unknown>;
  return typeof value?.[key] === "string" ? value[key] : "";
}

function u32(value: number) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(value);
  return b;
}

function toBuffer(data: RawData): ByteBuffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
