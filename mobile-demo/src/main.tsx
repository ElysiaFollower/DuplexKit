import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { downsample, floatToInt16Buffer, PcmFloat32Player, rms, SAMPLE_RATE } from "./audio";
import { applyToolRequest, toolResultFor } from "./mapDemo";
import { isRealtimeMessage } from "./types";
import type { DialogueTurn, MapDemoState, RealtimeMessage, ToolRequest } from "./types";
import "./styles.css";

const DEFAULT_PORT = "5177";
const INITIAL_MAP: MapDemoState = { visible: false, navigating: false };
const DEBUG_FROM_MODE = import.meta.env.MODE === "debug";

function initialHost(): string {
  const host = window.location.hostname;
  if (host && host !== "localhost" && host !== "127.0.0.1") return host;
  return "";
}

type ConnState = "idle" | "connecting" | "connected" | "error";
type DebugLevel = "debug" | "info" | "warn" | "error";
type DebugEntry = {
  id: string;
  at: string;
  level: DebugLevel;
  event: string;
  message?: string;
  data?: unknown;
};

function isDebugEnabled(): boolean {
  const params = new URLSearchParams(window.location.search);
  return DEBUG_FROM_MODE || params.get("debug") === "1" || params.get("debug") === "true";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function newId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function appendOrReplaceTurn(
  turns: DialogueTurn[],
  role: DialogueTurn["role"],
  text: string,
  final = false,
  append = false
): DialogueTurn[] {
  if (!text) return turns;
  const last = turns.at(-1);
  if (last?.role === role && !last.final && !append) {
    return [...turns.slice(0, -1), { ...last, text, final }];
  }
  return [
    ...turns,
    {
      id: newId(),
      role,
      text,
      final
    }
  ];
}

function finalizeLast(turns: DialogueTurn[], role?: DialogueTurn["role"]): DialogueTurn[] {
  const index = [...turns].reverse().findIndex((turn) => !turn.final && (!role || turn.role === role));
  if (index < 0) return turns;
  const target = turns.length - 1 - index;
  return turns.map((turn, current) => (current === target ? { ...turn, final: true } : turn));
}

function buildBaseUrl(host: string, port: string): string {
  const trimmedHost = host.trim();
  const trimmedPort = port.trim();
  const withProtocol = /^https?:\/\//i.test(trimmedHost) ? trimmedHost : `http://${trimmedHost}`;
  const url = new URL(withProtocol);
  if (trimmedPort) url.port = trimmedPort;
  return url.origin;
}

function App() {
  const [host, setHost] = useState(initialHost);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [connState, setConnState] = useState<ConnState>("idle");
  const [serviceState, setServiceState] = useState("idle");
  const [micOn, setMicOn] = useState(false);
  const [level, setLevel] = useState(0);
  const [turns, setTurns] = useState<DialogueTurn[]>([]);
  const [mapState, setMapState] = useState<MapDemoState>(INITIAL_MAP);
  const [lastTool, setLastTool] = useState("等待工具调用");
  const [error, setError] = useState("");
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const debugEnabled = useMemo(isDebugEnabled, []);

  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playerRef = useRef<PcmFloat32Player | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sinkRef = useRef<GainNode | null>(null);
  const runningRef = useRef(false);
  const mapStateRef = useRef<MapDemoState>(INITIAL_MAP);
  const debugEnabledRef = useRef(debugEnabled);

  const baseUrl = useMemo(() => {
    try {
      return buildBaseUrl(host, port);
    } catch {
      return "";
    }
  }, [host, port]);

  useEffect(() => {
    mapStateRef.current = mapState;
  }, [mapState]);

  const recordDebug = useCallback(
    (level: DebugLevel, event: string, message?: string, data?: unknown) => {
      if (!debugEnabledRef.current) return;
      const entry: DebugEntry = {
        id: newId(),
        at: new Date().toISOString(),
        level,
        event,
        message,
        data
      };
      setDebugEntries((current) => [...current.slice(-39), entry]);
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "client_debug",
            level,
            event,
            message,
            at: entry.at,
            data
          })
        );
      }
    },
    []
  );

  useEffect(() => {
    if (!debugEnabled) return;
    recordDebug("info", "debug_enabled", "Mobile debug mode enabled", {
      href: window.location.href,
      secureContext: window.isSecureContext,
      hasMediaDevices: Boolean(navigator.mediaDevices),
      hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
      userAgent: navigator.userAgent
    });

    const onError = (event: ErrorEvent) => {
      recordDebug("error", "window_error", event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      recordDebug("error", "unhandled_rejection", errorMessage(event.reason));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [debugEnabled, recordDebug]);

  const stopMic = useCallback(() => {
    runningRef.current = false;
    setMicOn(false);
    setLevel(0);
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    sinkRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    processorRef.current = null;
    sourceRef.current = null;
    sinkRef.current = null;
    streamRef.current = null;
    recordDebug("info", "microphone_stopped");
  }, [recordDebug]);

  const disconnect = useCallback(() => {
    stopMic();
    playerRef.current?.clear();
    socketRef.current?.close();
    socketRef.current = null;
    sinkRef.current?.disconnect();
    sinkRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    playerRef.current = null;
    setConnState("idle");
    setServiceState("idle");
    recordDebug("info", "socket_disconnected");
  }, [recordDebug, stopMic]);

  useEffect(() => () => disconnect(), [disconnect]);

  const sendToolResult = useCallback((request: ToolRequest, nextMapState: MapDemoState) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const result = toolResultFor(request, nextMapState);
    socket.send(
      JSON.stringify({
        type: "tool_result",
        toolCallId: request.toolCallId,
        tool: request.tool,
        status: "success",
        summary: result.summary,
        visibleResult: result.visibleResult,
        debugNote: "mobile-demo square-map acknowledged tool_request"
      })
    );
    recordDebug("info", "tool_result_sent", request.tool, { toolCallId: request.toolCallId });
  }, [recordDebug]);

  const handleJsonMessage = useCallback(
    (message: RealtimeMessage) => {
      switch (message.type) {
        case "status":
          setServiceState(message.state || "connected");
          break;
        case "error":
          setError(message.message || "Realtime service error");
          setConnState("error");
          recordDebug("error", "server_error", message.message);
          break;
        case "asr_start":
          playerRef.current?.clear();
          setServiceState("listening");
          break;
        case "transcript":
          setTurns((current) => appendOrReplaceTurn(current, "user", message.text || ""));
          break;
        case "assistant_text":
          setTurns((current) => appendOrReplaceTurn(current, "assistant", message.text || "", false, Boolean(message.append)));
          break;
        case "message_end":
          if (message.role === "user") setTurns((current) => finalizeLast(current, "user"));
          if (message.role === "assistant" || message.role === "audio") {
            setTurns((current) => finalizeLast(current, "assistant"));
          }
          break;
        case "asr_end":
          setServiceState("thinking");
          setTurns((current) => finalizeLast(current, "user"));
          break;
        case "tts_start":
          if (!message.suppressed) setServiceState("speaking");
          break;
        case "tts_end":
        case "llm_end":
          setServiceState("listening");
          setTurns((current) => finalizeLast(current, "assistant"));
          break;
        case "tool_request":
          if (message.request) {
            const next = applyToolRequest(mapStateRef.current, message.request);
            mapStateRef.current = next;
            setMapState(next);
            setLastTool(`${message.request.tool} · ${next.lastResult || "done"}`);
            recordDebug("info", "tool_request", message.request.tool, message.request);
            sendToolResult(message.request, next);
          }
          break;
        case "tool":
          if (message.tool || message.summary || message.visibleResult) {
            setLastTool(`${message.tool || "tool"} · ${message.visibleResult || message.summary || message.status || "updated"}`);
          }
          break;
        default:
          break;
      }
    },
    [recordDebug, sendToolResult]
  );

  const connect = useCallback(async () => {
    if (!baseUrl) {
      setError("请输入有效的 Mac IP 和端口");
      setConnState("error");
      return;
    }
    setError("");
    setConnState("connecting");
    try {
      const wsUrl = `${baseUrl.replace(/^http/i, "ws")}/api/realtime`;
      recordDebug("info", "socket_connecting", wsUrl);
      const socket = new WebSocket(wsUrl);
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;
      socket.addEventListener("open", () => {
        setConnState("connected");
        setServiceState("connected");
        recordDebug("info", "socket_open", wsUrl, {
          secureContext: window.isSecureContext,
          hasMediaDevices: Boolean(navigator.mediaDevices),
          hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia)
        });
      });
      socket.addEventListener("message", async (event) => {
        if (typeof event.data === "string") {
          try {
            const parsed = JSON.parse(event.data) as unknown;
            if (isRealtimeMessage(parsed)) {
              handleJsonMessage(parsed);
            } else {
              recordDebug("warn", "unexpected_json_message", "Received JSON message with unknown shape", parsed);
            }
          } catch (parseError) {
            recordDebug("error", "json_parse_error", errorMessage(parseError), event.data);
          }
          return;
        }
        const bytes = event.data instanceof Blob ? await event.data.arrayBuffer() : (event.data as ArrayBuffer);
        playerRef.current?.play(bytes);
      });
      socket.addEventListener("close", () => {
        stopMic();
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        setConnState("idle");
        setServiceState("closed");
        recordDebug("warn", "socket_closed");
      });
      socket.addEventListener("error", () => {
        setError("WebSocket 连接失败，请确认 Mac IP、端口和局域网可达");
        setConnState("error");
        recordDebug("error", "socket_error", "WebSocket 连接失败，请确认 Mac IP、端口和局域网可达");
      });
    } catch (connectError) {
      setError(errorMessage(connectError));
      setConnState("error");
      recordDebug("error", "socket_connect_failed", errorMessage(connectError));
    }
  }, [baseUrl, handleJsonMessage, recordDebug, stopMic]);

  const startMic = useCallback(async () => {
    if (connState !== "connected" || socketRef.current?.readyState !== WebSocket.OPEN) {
      setError("请先连接后端");
      return;
    }
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      const message = "getUserMedia not found. 手机浏览器通常要求 HTTPS 或 localhost 才开放麦克风。";
      recordDebug("error", "microphone_api_missing", message, {
        secureContext: window.isSecureContext,
        hasMediaDevices: Boolean(navigator.mediaDevices),
        hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
        protocol: window.location.protocol,
        host: window.location.host,
        userAgent: navigator.userAgent
      });
      throw new Error(message);
    }
    recordDebug("info", "microphone_starting", undefined, {
      secureContext: window.isSecureContext,
      sampleRateTarget: SAMPLE_RATE
    });
    const context = audioContextRef.current || new AudioContext();
    audioContextRef.current = context;
    playerRef.current ||= new PcmFloat32Player(context);
    await context.resume();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(2048, 1, 1);
    const sink = context.createGain();
    sink.gain.value = 0;
    processor.onaudioprocess = (event) => {
      if (!runningRef.current || socketRef.current?.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      setLevel(Math.min(100, Math.round(rms(input) * 520)));
      const pcm = downsample(input, context.sampleRate, SAMPLE_RATE);
      socketRef.current.send(floatToInt16Buffer(pcm));
    };
    source.connect(processor);
    processor.connect(sink);
    sink.connect(context.destination);
    streamRef.current = stream;
    sourceRef.current = source;
    processorRef.current = processor;
    sinkRef.current = sink;
    runningRef.current = true;
    setMicOn(true);
    recordDebug("info", "microphone_started", undefined, {
      inputSampleRate: context.sampleRate,
      tracks: stream.getAudioTracks().map((track) => ({
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      }))
    });
  }, [connState, recordDebug]);

  const toggleMic = useCallback(async () => {
    if (micOn) {
      stopMic();
      return;
    }
    try {
      await startMic();
    } catch (micError) {
      const message = errorMessage(micError);
      setError(message);
      recordDebug("error", "microphone_error", message, {
        secureContext: window.isSecureContext,
        hasMediaDevices: Boolean(navigator.mediaDevices),
        hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia)
      });
      stopMic();
    }
  }, [micOn, recordDebug, startMic, stopMic]);

  const clearDemo = useCallback(() => {
    setTurns([]);
    setMapState(INITIAL_MAP);
    setLastTool("等待工具调用");
    mapStateRef.current = INITIAL_MAP;
  }, []);

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">DuplexKit mobile demo</p>
          <h1>后端实时语音验证</h1>
        </div>
        <span className={`status status-${connState}`}>{connState}</span>
      </section>

      {debugEnabled ? (
        <section className="debug-banner">
          Debug on · secure={String(window.isSecureContext)} · media={String(Boolean(navigator.mediaDevices?.getUserMedia))}
        </section>
      ) : null}

      <section className="connect-row" aria-label="Backend connection">
        <label>
          <span>Mac IP</span>
          <input value={host} inputMode="decimal" placeholder="10.x.x.x" onChange={(event) => setHost(event.target.value)} />
        </label>
        <label>
          <span>Port</span>
          <input value={port} inputMode="numeric" placeholder="5177" onChange={(event) => setPort(event.target.value)} />
        </label>
        <button className="connect-button" onClick={connState === "connected" ? disconnect : connect}>
          {connState === "connected" ? "断开" : "连接"}
        </button>
      </section>

      <section className="voice-panel">
        <button className={`voice-button ${micOn ? "recording" : ""}`} onClick={toggleMic} disabled={connState !== "connected"}>
          <span className="voice-dot" />
          {micOn ? "停止语音" : "按下开始语音"}
        </button>
        <div className="meter" aria-label="Microphone level">
          <span style={{ width: `${level}%` }} />
        </div>
        <p className="hint">
          {serviceState} · 会话打开后持续发送 24kHz PCM chunk；停止按钮只停麦克风，不关闭连接。
        </p>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="dialogue-panel" aria-label="Dialogue">
        {turns.length ? (
          turns.slice(-8).map((turn) => (
            <article className={`turn ${turn.role}`} key={turn.id}>
              <span>{turn.role === "user" ? "我" : turn.role === "assistant" ? "助手" : "系统"}</span>
              <p>{turn.text}</p>
            </article>
          ))
        ) : (
          <p className="empty">连接后开始说话。文本会随后端 transcript / assistant_text 更新。</p>
        )}
      </section>

      <section className="tool-panel" aria-label="Square map tool demo">
        <div className="tool-header">
          <div>
            <p className="eyebrow">Tool demo</p>
            <h2>正方形地图</h2>
          </div>
          <button className="ghost-button" onClick={clearDemo}>清空</button>
        </div>
        <div className={`square-map ${mapState.visible ? "visible" : "hidden"} ${mapState.navigating ? "navigating" : ""}`}>
          <span className="corner top-left">{mapState.origin ? "起" : ""}</span>
          <span className="corner top-right" />
          <span className="corner bottom-left" />
          <span className="corner bottom-right">{mapState.destination ? "终" : ""}</span>
          <div className="route-line" />
          <strong>{mapState.visible ? (mapState.navigating ? "导航中" : "地图打开") : "地图关闭"}</strong>
        </div>
        <dl className="tool-facts">
          <div>
            <dt>起点</dt>
            <dd>{mapState.origin || "-"}</dd>
          </div>
          <div>
            <dt>终点</dt>
            <dd>{mapState.destination || "-"}</dd>
          </div>
          <div>
            <dt>最近动作</dt>
            <dd>{lastTool}</dd>
          </div>
        </dl>
      </section>

      {debugEnabled ? (
        <section className="debug-panel" aria-label="Debug log">
          <div className="tool-header">
            <div>
              <p className="eyebrow">Debug</p>
              <h2>手机端错误日志</h2>
            </div>
            <button className="ghost-button" onClick={() => setDebugEntries([])}>清空</button>
          </div>
          {debugEntries.length ? (
            <ol>
              {debugEntries
                .slice()
                .reverse()
                .map((entry) => (
                  <li className={`debug-entry ${entry.level}`} key={entry.id}>
                    <strong>{entry.level} · {entry.event}</strong>
                    <span>{new Date(entry.at).toLocaleTimeString()}</span>
                    {entry.message ? <p>{entry.message}</p> : null}
                    {entry.data === undefined ? null : <pre>{JSON.stringify(entry.data, null, 2)}</pre>}
                  </li>
                ))}
            </ol>
          ) : (
            <p className="empty">暂无 debug 事件。</p>
          )}
        </section>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
