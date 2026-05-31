#!/usr/bin/env node
import "dotenv/config";
import crypto from "node:crypto";
import http from "node:http";
import { gunzipSync, gzipSync } from "node:zlib";
import WebSocket, { WebSocketServer } from "ws";

const port = Number(process.env.RAW_REALTIME_PORT || 5199);
const sampleRate = Number(process.env.VOLCENGINE_REALTIME_SAMPLE_RATE || 24000);
const endpoint = process.env.VOLCENGINE_REALTIME_ENDPOINT || "wss://openspeech.bytedance.com/api/v3/realtime/dialogue";
const appId = process.env.VOLCENGINE_REALTIME_APP_ID || process.env.APP_ID || "";
const accessToken = process.env.VOLCENGINE_REALTIME_ACCESS_TOKEN || process.env.ACCESS_TOKEN || "";
const resourceId = process.env.VOLCENGINE_REALTIME_RESOURCE_ID || "volc.speech.dialog";
const appKey = process.env.VOLCENGINE_REALTIME_APP_KEY || "PlgvMymc7f3tQnJ6";
const speaker = process.env.VOLCENGINE_REALTIME_SPEAKER || "zh_female_vv_jupiter_bigtts";

const events = {
  startConnection: 1,
  finishConnection: 2,
  startSession: 100,
  finishSession: 102,
  audio: 200,
  asrStart: 450,
  asrResponse: 451,
  asrEnd: 459,
  ttsStart: 350,
  ttsResponse: 352,
  ttsEnd: 359,
  llmText: 550,
  llmTextEnd: 559
};

const eventNames = new Map([
  [50, "ConnectionStarted"],
  [51, "ConnectionFailed"],
  [150, "SessionStarted"],
  [153, "SessionFailed"],
  [350, "TTSStarted"],
  [352, "TTSResponse"],
  [359, "TTSEnded"],
  [450, "ASRStarted"],
  [451, "ASRResponse"],
  [459, "ASREnded"],
  [550, "ChatResponse"],
  [559, "ChatEnded"],
  [599, "DialogCommonError"]
]);

if (!appId || !accessToken) {
  console.error("Missing VOLCENGINE_REALTIME_APP_ID/APP_ID or VOLCENGINE_REALTIME_ACCESS_TOKEN/ACCESS_TOKEN");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page());
    return;
  }
  res.writeHead(404).end("not found");
});

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (client) => new RawBridge(client));

server.listen(port, "127.0.0.1", () => {
  console.log(`raw realtime demo: http://127.0.0.1:${port}`);
});

class RawBridge {
  sessionId = crypto.randomUUID();
  upstream;
  queuedAudio = [];
  connectionStarted = false;
  sessionStarted = false;
  closed = false;

  constructor(client) {
    this.client = client;
    this.upstream = new WebSocket(endpoint, {
      headers: {
        "X-Api-App-ID": appId,
        "X-Api-Access-Key": accessToken,
        "X-Api-Resource-Id": resourceId,
        "X-Api-App-Key": appKey,
        "X-Api-Connect-Id": crypto.randomUUID()
      }
    });

    client.on("message", (data, isBinary) => {
      if (isBinary) this.sendAudio(Buffer.from(data));
      else if (Buffer.from(data).toString("utf8") === "stop") this.close();
    });
    client.on("close", () => this.close());
    client.on("error", () => this.close());

    this.upstream.on("open", () => {
      this.sendJson({ type: "status", state: "upstream-open" });
      this.upstream.send(packet(events.startConnection, {}));
    });
    this.upstream.on("message", (data) => this.handleUpstream(Buffer.from(data)));
    this.upstream.on("error", (error) => this.fail(error.message));
    this.upstream.on("close", () => this.sendJson({ type: "status", state: "upstream-closed" }));
  }

  sendAudio(pcm) {
    if (this.closed || pcm.length === 0) return;
    if (!this.sessionStarted) {
      this.queuedAudio.push(pcm);
      if (this.queuedAudio.length > 100) this.queuedAudio.shift();
      return;
    }
    this.upstream.send(audioPacket(pcm, this.sessionId));
  }

  handleUpstream(data) {
    const parsed = parseResponse(data);
    if (parsed.error) {
      this.fail(`Volcengine error ${parsed.code}: ${parsed.payload}`);
      return;
    }

    if (!this.connectionStarted) {
      this.connectionStarted = true;
      this.sendJson({ type: "status", state: "starting-session" });
      this.upstream.send(
        packet(
          events.startSession,
          {
            tts: {
              audio_config: { channel: 1, format: "pcm", sample_rate: sampleRate },
              speaker
            },
            dialog: {
              bot_name: "豆包",
              system_role: "你是一个实时语音助手。请正常对话，简短回答。",
              dialog_id: this.sessionId,
              speaking_style: "自然、简短。",
              extra: { strict_audit: false, model: "1.2.1.1" }
            }
          },
          this.sessionId
        )
      );
      return;
    }

    if (!this.sessionStarted) {
      this.sessionStarted = true;
      this.sendJson({ type: "status", state: "listening", sampleRate });
      for (const pcm of this.queuedAudio.splice(0)) this.sendAudio(pcm);
      return;
    }

    this.forward(parsed);
  }

  forward(parsed) {
    this.sendJson({
      type: "event",
      event: parsed.event,
      name: eventNames.get(parsed.event) || "Unknown",
      payload: scrubPayload(parsed.payload)
    });

    if (parsed.event === events.asrStart) this.sendJson({ type: "asr_start" });
    if (parsed.event === events.asrEnd) this.sendJson({ type: "asr_end" });
    if (parsed.event === events.ttsStart) this.sendJson({ type: "tts_start" });
    if (parsed.event === events.ttsEnd) this.sendJson({ type: "tts_end" });
    if (parsed.event === events.llmTextEnd) this.sendJson({ type: "llm_end" });

    if (parsed.event === events.asrResponse) {
      const text = extractTranscript(parsed.payload);
      if (text) this.sendJson({ type: "transcript", text });
    }

    if (parsed.event === events.llmText) {
      const text = extractText(parsed.payload);
      if (text) this.sendJson({ type: "assistant_text", text });
    }

    if (parsed.event === events.ttsResponse && parsed.rawPayload.length > 0) {
      this.client.send(parsed.rawPayload, { binary: true });
    }
  }

  fail(message) {
    this.sendJson({ type: "error", message });
    this.close();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.upstream.readyState === WebSocket.OPEN) {
      this.upstream.send(packet(events.finishSession, {}, this.sessionId));
      this.upstream.send(packet(events.finishConnection, {}));
    }
    this.upstream.close();
  }

  sendJson(payload) {
    if (this.client.readyState === WebSocket.OPEN) this.client.send(JSON.stringify(payload));
  }
}

function packet(event, payload, sid) {
  const payloadBytes = gzipSync(Buffer.from(JSON.stringify(payload)));
  const chunks = [Buffer.from([0x11, 0x14, 0x11, 0x00]), u32(event)];
  if (sid) chunks.push(u32(Buffer.byteLength(sid)), Buffer.from(sid));
  chunks.push(u32(payloadBytes.length), payloadBytes);
  return Buffer.concat(chunks);
}

function audioPacket(pcm, sid) {
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

function parseResponse(buffer) {
  const headerSize = buffer[0] & 0x0f;
  const messageType = buffer[1] >> 4;
  const flags = buffer[1] & 0x0f;
  const serialization = buffer[2] >> 4;
  const compression = buffer[2] & 0x0f;
  let payload = buffer.subarray(headerSize * 4);
  let event = null;
  let rawPayload = Buffer.alloc(0);

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

  let decoded = rawPayload;
  if (compression === 1 && rawPayload.length > 0) decoded = gunzipSync(rawPayload);
  if (serialization === 1 && decoded.length > 0) {
    return { event, payload: JSON.parse(decoded.toString("utf8")), rawPayload: decoded };
  }
  return { event, payload: decoded, rawPayload: decoded };
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

function extractTranscript(payload) {
  return payload?.results?.[0]?.text || payload?.results?.[0]?.alternatives?.[0]?.text || payload?.text || "";
}

function extractText(payload) {
  return payload?.content || payload?.text || "";
}

function scrubPayload(payload) {
  if (!payload || typeof payload !== "object" || Buffer.isBuffer(payload)) return undefined;
  return {
    text: payload.text,
    content: payload.content,
    tts_type: payload.tts_type,
    question_id: payload.question_id,
    reply_id: payload.reply_id,
    results: payload.results
  };
}

function page() {
  return `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Raw Volc Realtime Demo</title>
<style>
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:24px;line-height:1.45;color:#111;background:#fafafa}
button{font:inherit;padding:8px 14px;margin-right:8px}
.row{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
#meter{width:240px;height:12px;background:#ddd;position:relative}
#bar{height:100%;width:0;background:#15803d}
#log{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}
pre{background:#fff;border:1px solid #ddd;padding:10px;min-height:260px;max-height:70vh;overflow:auto;white-space:pre-wrap}
</style>
<body>
<h1>Raw Volc Realtime Demo</h1>
<div class="row">
  <button id="start">Start</button>
  <button id="stop" disabled>Stop</button>
  <strong id="state">idle</strong>
  <div id="meter"><div id="bar"></div></div>
  <span id="stats"></span>
</div>
<div id="log">
  <pre id="dialogue"></pre>
  <pre id="events"></pre>
</div>
<script>
const SAMPLE_RATE = ${sampleRate};
let ws, stream, ctx, source, processor, playbackAt = 0, frames = 0, bytes = 0;
const startBtn = document.querySelector("#start");
const stopBtn = document.querySelector("#stop");
const stateEl = document.querySelector("#state");
const bar = document.querySelector("#bar");
const statsEl = document.querySelector("#stats");
const dialogue = document.querySelector("#dialogue");
const events = document.querySelector("#events");
startBtn.onclick = start;
stopBtn.onclick = stop;

async function start() {
  startBtn.disabled = true;
  stopBtn.disabled = false;
  setState("starting");
  stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
  ctx = new AudioContext();
  await ctx.resume();
  playbackAt = ctx.currentTime;
  logEvent("mic", stream.getAudioTracks()[0]?.getSettings?.() || {});
  source = ctx.createMediaStreamSource(stream);
  processor = ctx.createScriptProcessor(2048, 1, 1);
  processor.onaudioprocess = onAudio;
  source.connect(processor);
  processor.connect(ctx.destination);
  ws = new WebSocket((location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + "/ws");
  ws.binaryType = "arraybuffer";
  ws.onopen = () => setState("socket-open");
  ws.onclose = () => setState("closed");
  ws.onerror = () => setState("socket-error");
  ws.onmessage = onMessage;
}

function stop() {
  ws?.send("stop");
  ws?.close();
  processor?.disconnect();
  source?.disconnect();
  stream?.getTracks().forEach(track => track.stop());
  ctx?.close();
  ws = stream = ctx = source = processor = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  setState("idle");
}

function onAudio(event) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !ctx) return;
  const input = event.inputBuffer.getChannelData(0);
  const stat = sampleStats(input);
  bar.style.width = Math.min(100, Math.round(stat.rms * 520)) + "%";
  const pcm24 = resampleLinear(input, ctx.sampleRate, SAMPLE_RATE);
  const payload = floatToInt16(pcm24);
  ws.send(payload);
  frames += 1;
  bytes += payload.byteLength;
  statsEl.textContent = "frames=" + frames + " bytes=" + bytes + " rms=" + stat.rms.toFixed(5) + " peak=" + stat.peak.toFixed(5) + " ctx=" + ctx.sampleRate;
}

async function onMessage(event) {
  if (typeof event.data !== "string") {
    const data = event.data instanceof Blob ? await event.data.arrayBuffer() : event.data;
    playFloat32(data);
    return;
  }
  const msg = JSON.parse(event.data);
  if (msg.type === "status") setState(msg.state);
  if (msg.type === "transcript") appendDialogue("YOU", msg.text);
  if (msg.type === "assistant_text") appendDialogue("AI", msg.text);
  logEvent(msg.type, msg);
}

function playFloat32(data) {
  if (!ctx || !data.byteLength) return;
  const samples = new Float32Array(data);
  const audio = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
  audio.getChannelData(0).set(samples.map(v => Math.max(-1, Math.min(1, v))));
  const node = ctx.createBufferSource();
  node.buffer = audio;
  node.connect(ctx.destination);
  const startAt = Math.max(ctx.currentTime + 0.02, playbackAt);
  node.start(startAt);
  playbackAt = startAt + audio.duration;
}

function resampleLinear(input, inRate, outRate) {
  if (inRate === outRate) return new Float32Array(input);
  const ratio = inRate / outRate;
  const output = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < output.length; i++) {
    const x = i * ratio;
    const lo = Math.floor(x);
    const hi = Math.min(lo + 1, input.length - 1);
    const w = x - lo;
    output[i] = input[lo] * (1 - w) + input[hi] * w;
  }
  return output;
}

function floatToInt16(samples) {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return buffer;
}

function sampleStats(samples) {
  let peak = 0, sum = 0;
  for (const s of samples) {
    const abs = Math.abs(s);
    if (abs > peak) peak = abs;
    sum += s * s;
  }
  return { peak, rms: Math.sqrt(sum / Math.max(samples.length, 1)) };
}

function appendDialogue(role, text) {
  dialogue.textContent = new Date().toLocaleTimeString() + " " + role + ": " + text + "\\n" + dialogue.textContent;
}

function logEvent(type, payload) {
  events.textContent = new Date().toLocaleTimeString() + " " + type + " " + JSON.stringify(payload, null, 2) + "\\n\\n" + events.textContent;
}

function setState(value) {
  stateEl.textContent = value;
}
</script>
</body>
</html>`;
}
