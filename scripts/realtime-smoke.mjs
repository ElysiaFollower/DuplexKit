#!/usr/bin/env node
import "dotenv/config";
import { gzipSync, gunzipSync } from "node:zlib";
import crypto from "node:crypto";

const appId = process.env.VOLCENGINE_REALTIME_APP_ID || process.env.APP_ID;
const accessToken = process.env.VOLCENGINE_REALTIME_ACCESS_TOKEN || process.env.ACCESS_TOKEN;
const url = process.env.VOLCENGINE_REALTIME_ENDPOINT || "wss://openspeech.bytedance.com/api/v3/realtime/dialogue";
const sessionId = crypto.randomUUID();
const mode = process.env.REALTIME_SMOKE_MODE || "audio";
const audioWavPath = process.env.REALTIME_SMOKE_AUDIO_WAV || "/tmp/duplex-realtime-input.wav";

if (!appId || !accessToken) {
  console.error("missing APP_ID/ACCESS_TOKEN or VOLCENGINE_REALTIME_APP_ID/VOLCENGINE_REALTIME_ACCESS_TOKEN");
  process.exit(1);
}

const events = {
  startConnection: 1,
  finishConnection: 2,
  startSession: 100,
  finishSession: 102,
  audio: 200,
  chatTtsText: 300,
  ttsResponse: 352,
  ttsEnd: 359,
  llmText: 550,
  llmTextEnd: 559
};

const ws = new WebSocket(url, {
  headers: {
    "X-Api-App-ID": appId,
    "X-Api-Access-Key": accessToken,
    "X-Api-Resource-Id": "volc.speech.dialog",
    "X-Api-App-Key": "PlgvMymc7f3tQnJ6",
    "X-Api-Connect-Id": crypto.randomUUID()
  }
});

const seen = [];
let audioBytes = 0;
let text = "";
let transcript = "";
let done = false;
let connectionStarted = false;
let sessionStarted = false;

const timeout = setTimeout(() => {
  console.error(JSON.stringify({ ok: false, reason: "timeout", seen, text, audioBytes }, null, 2));
  ws.close();
  process.exit(2);
}, 20000);

ws.addEventListener("open", () => {
  ws.send(packet(events.startConnection, {}));
});

ws.addEventListener("message", async (message) => {
  const data = Buffer.from(await message.data.arrayBuffer());
  const parsed = parseResponse(data);
  if (parsed.error) {
    clearTimeout(timeout);
    console.error(JSON.stringify({ ok: false, reason: "server-error", error: parsed, seen }, null, 2));
    ws.close();
    process.exit(5);
  }
  if (parsed.event) seen.push(parsed.event);

  if (!connectionStarted) {
    connectionStarted = true;
    ws.send(packet(events.startSession, {
      tts: {
        audio_config: { channel: 1, format: "pcm", sample_rate: 24000 },
        speaker: process.env.VOLCENGINE_REALTIME_SPEAKER || "zh_female_vv_jupiter_bigtts"
      },
      dialog: {
        bot_name: "豆包",
        system_role: "你是一个简短中文语音助手。",
        dialog_id: sessionId,
        speaking_style: "回答简短自然。",
        extra: { strict_audit: false }
      }
    }, sessionId));
    return;
  }

  if (connectionStarted && !sessionStarted) {
    sessionStarted = true;
    if (mode === "text") {
      ws.send(packet(events.chatTtsText, { content: "请用一句中文说：实时语音大模型连接成功。" }, sessionId));
    } else {
      await sendAudioChunks(ws);
    }
    return;
  }

  if (parsed.event === events.llmText && parsed.payload?.content) {
    text += parsed.payload.content;
  }
  if (parsed.event === 451 && parsed.payload?.results?.[0]?.alternatives?.[0]?.text) {
    transcript = parsed.payload.results[0].alternatives[0].text;
  }
  if (parsed.event === events.ttsResponse && parsed.rawPayload) {
    audioBytes += parsed.rawPayload.length;
  }
  if (parsed.event === events.ttsEnd || parsed.event === events.llmTextEnd) {
    done = true;
    clearTimeout(timeout);
    console.log(JSON.stringify({ ok: true, mode, seen, transcript, text, audioBytes }, null, 2));
    ws.close();
  }
});

ws.addEventListener("error", (error) => {
  clearTimeout(timeout);
  console.error(JSON.stringify({ ok: false, reason: "websocket-error", error: String(error.message || error), seen }, null, 2));
  process.exit(3);
});

ws.addEventListener("close", () => {
  if (!done) {
    clearTimeout(timeout);
    console.error(JSON.stringify({ ok: false, reason: "closed", seen, text, audioBytes }, null, 2));
    process.exit(4);
  }
});

function packet(event, payload, sid) {
  const payloadBytes = gzipSync(Buffer.from(JSON.stringify(payload)));
  const chunks = [header(), u32(event)];
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

async function sendAudioChunks(socket) {
  const { readFileSync, existsSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  if (!existsSync(audioWavPath)) {
    const aiff = audioWavPath.replace(/\.wav$/i, ".aiff");
    execFileSync("say", ["-o", aiff, "你好，请介绍一下你自己。"]);
    execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@24000", aiff, audioWavPath]);
  }
  const pcm = extractWavData(readFileSync(audioWavPath));
  const chunkBytes = 24000 * 2 / 10;
  for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
    socket.send(audioPacket(pcm.subarray(offset, Math.min(pcm.length, offset + chunkBytes)), sessionId));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const silence = Buffer.alloc(chunkBytes);
  for (let i = 0; i < 10; i += 1) {
    socket.send(audioPacket(silence, sessionId));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function extractWavData(wav) {
  const dataIndex = wav.indexOf(Buffer.from("data"));
  if (dataIndex < 0) throw new Error("WAV data chunk not found");
  const size = wav.readUInt32LE(dataIndex + 4);
  return wav.subarray(dataIndex + 8, dataIndex + 8 + size);
}

function header() {
  return Buffer.from([0x11, 0x14, 0x11, 0x00]);
}

function u32(value) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(value);
  return b;
}

function parseResponse(buffer) {
  const headerSize = buffer[0] & 0x0f;
  const messageType = buffer[1] >> 4;
  const flags = buffer[1] & 0x0f;
  const serialization = buffer[2] >> 4;
  const compression = buffer[2] & 0x0f;
  let payload = buffer.subarray(headerSize * 4);
  let event = null;
  let rawPayload = null;

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
    return { event, payload: JSON.parse(decoded.toString("utf8")), rawPayload };
  }
  return { event, payload: decoded, rawPayload: decoded };
}
