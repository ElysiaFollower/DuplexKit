import crypto from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type { RawData, WebSocket as ClientSocket } from "ws";
import WebSocket from "ws";
import type { AppConfig } from "./config.js";
import { getRuntimeSettings } from "./runtimeSettings.js";
import {
  clarificationPrompt,
  DemoToolRuntime,
  type ToolCallState,
  type ToolRequest,
  type ToolResult,
  toolResultPrompt,
  toolStartedPrompt,
  type ToolResultInput
} from "./toolPlanner.js";
import { normalizeToolResultInput, StopControlSchema, ToolResultInputSchema, toToolRequestPayload } from "./protocol.js";

type RealtimeConfig = AppConfig["realtime"];
type ByteBuffer = Buffer<ArrayBufferLike>;
type PendingToolInvocation = {
  call: ToolCallState;
  timeout: ReturnType<typeof setTimeout>;
  state: "waiting" | "resolved" | "timed_out";
};

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
  private suppressDefaultReply = false;
  private currentAudioAllowed = true;
  private pendingToolCalls = new Map<string, PendingToolInvocation>();

  constructor(private readonly client: ClientSocket, private readonly config: RealtimeConfig) {
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
      if (!this.closed) this.sendJson({ type: "status", state: "realtime-closed" });
      this.closed = true;
    });
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
        this.close();
        return;
      }

      const toolResult = ToolResultInputSchema.safeParse(message);
      if (toolResult.success) {
        this.handleToolResult(normalizeToolResultInput(toolResult.data));
        return;
      }

      this.sendJson({ type: "error", message: "Invalid client control message" });
    } catch {
      this.sendJson({ type: "error", message: "Invalid client control message" });
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pendingToolCalls.values()) clearTimeout(pending.timeout);
    this.pendingToolCalls.clear();
    if (this.upstream.readyState === WebSocket.OPEN) {
      this.upstream.send(packet(events.finishSession, {}, this.sessionId));
      this.upstream.send(packet(events.finishConnection, {}));
    }
    this.upstream.close();
  }

  private handleUpstreamMessage(data: Buffer) {
    const parsed = parseResponse(data);
    if (parsed.error) {
      this.fail(`Volcengine error ${parsed.code}: ${parsed.payload}`);
      return;
    }
    if (!this.connectionStarted) {
      this.connectionStarted = true;
      const runtimeSettings = getRuntimeSettings();
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
      this.suppressDefaultReply = false;
      this.currentAudioAllowed = true;
      this.tools.markPossiblySuperseded();
      this.sendJson({ type: "asr_start", questionId: this.currentQuestionId });
    }
    if (parsed.event === events.asrEnd) {
      this.sendJson({ type: "asr_end", questionId: this.currentQuestionId });
      void this.runPlanner();
    }
    if (parsed.event === events.ttsStart) {
      const ttsType = extractId(parsed.payload, "tts_type");
      this.currentAudioAllowed = !this.suppressDefaultReply || ttsType === "chat_tts_text" || ttsType === "external_rag";
      this.sendJson({
        type: "tts_start",
        replyId: extractId(parsed.payload, "reply_id"),
        ttsType,
        suppressed: !this.currentAudioAllowed
      });
    }
    if (parsed.event === events.ttsSentenceEnd) this.sendJson({ type: "tts_sentence_end" });
    if (parsed.event === events.ttsEnd) this.sendJson({ type: "tts_end" });
    if (parsed.event === events.llmTextEnd) this.sendJson({ type: "llm_end" });

    if (parsed.event === events.asrResponse) {
      const transcript = extractTranscript(parsed.payload);
      if (transcript) {
        this.latestTranscript = transcript;
        this.sendJson({ type: "transcript", text: transcript, questionId: this.currentQuestionId });
      }
    }

    if (parsed.event === events.llmText) {
      const delta = extractTextDelta(parsed.payload);
      if (delta && this.currentAudioAllowed) {
        this.text += delta;
        this.sendJson({ type: "assistant_text", delta, text: this.text });
      }
    }

    if (parsed.event === events.ttsResponse && parsed.rawPayload.length > 0 && this.currentAudioAllowed) {
      this.client.send(parsed.rawPayload, { binary: true });
    }
  }

  private async runPlanner() {
    const transcript = this.latestTranscript.trim();
    const turnId = this.currentQuestionId || crypto.randomUUID();
    const decision = this.tools.plan(transcript);
    this.sendJson({ type: "planner", transcript, decision });

    if (decision.action === "ask_clarification") {
      this.suppressDefaultReply = true;
      this.currentAudioAllowed = false;
      this.sendChatTtsText(decision.question, "ask_clarification");
      this.sendJson({ type: "tool", phase: "clarification", prompt: clarificationPrompt(decision) });
      return;
    }

    if (decision.action !== "tool_call") return;

    this.suppressDefaultReply = true;
    this.currentAudioAllowed = false;
    const call = this.tools.start(turnId, decision);
    const request = this.buildToolRequest(call, decision.spoken);
    const timeout = setTimeout(() => void this.resolvePendingToolCall(call.toolCallId), 1800);
    this.pendingToolCalls.set(call.toolCallId, { call, timeout, state: "waiting" });
    this.sendJson({ type: "tool", phase: "started", call });
    this.sendJson(toToolRequestPayload(request));
    this.sendJson({ type: "tool", phase: "started_prompt", prompt: toolStartedPrompt(call, decision.spoken) });
    this.sendChatTtsText(decision.spoken, "tool_started");
  }

  private handleToolResult(result: ToolResultInput) {
    const pending = this.pendingToolCalls.get(result.toolCallId);
    if (!pending) {
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
    this.finalizeToolResult(normalized);
  }

  private async resolvePendingToolCall(toolCallId: string) {
    const pending = this.pendingToolCalls.get(toolCallId);
    if (!pending || pending.state !== "waiting" || this.closed) return;
    pending.state = "timed_out";
    const result = await this.tools.execute(toolCallId);
    if (!result) {
      this.pendingToolCalls.delete(toolCallId);
      this.sendJson({ type: "tool", phase: "dropped", toolCallId });
      return;
    }
    if (pending.state !== "timed_out") return;
    this.pendingToolCalls.delete(toolCallId);
    pending.state = "resolved";
    this.finalizeToolResult(result);
  }

  private finalizeToolResult(result: ToolResult) {
    this.sendJson({ type: "tool", phase: "result", result });
    this.sendJson({ type: "tool", phase: "result_prompt", prompt: toolResultPrompt(result) });
    this.sendChatTtsText(`好了，${result.summary}。`, "tool_result");
  }

  private buildToolRequest(call: ToolCallState, spoken: string): ToolRequest {
    return {
      toolCallId: call.toolCallId,
      turnId: call.turnId,
      tool: call.tool,
      args: call.args,
      spoken,
      prompt: toolStartedPrompt(call, spoken)
    };
  }

  private sendChatRagText(externalRag: string) {
    if (this.closed || this.upstream.readyState !== WebSocket.OPEN || !this.sessionStarted) return;
    this.upstream.send(packet(events.chatRagText, { external_rag: externalRag }, this.sessionId));
  }

  private sendChatTtsText(content: string, source = "server_chat_tts") {
    if (this.closed || this.upstream.readyState !== WebSocket.OPEN || !this.sessionStarted) return;
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
    this.sendJson({ type: "error", message });
    this.close();
  }

  private sendJson(payload: unknown) {
    if (this.client.readyState === WebSocket.OPEN) this.client.send(JSON.stringify(payload));
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
