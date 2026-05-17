#!/usr/bin/env node
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import WebSocket from "ws";

const port = process.env.PORT || "5177";
const url = process.env.REALTIME_BRIDGE_URL || `ws://127.0.0.1:${port}/api/realtime`;
const audioWavPath = process.env.REALTIME_SMOKE_AUDIO_WAV || "/tmp/duplex-realtime-input.wav";

let transcript = "";
let text = "";
let audioBytes = 0;
const audioChunks = [];
let sent = false;
const seen = [];
const toolEvents = [];
let toolStarted = false;
let toolSettled = false;
let llmEndAfterTool = false;
let keepAliveInterval;
let finished = false;

const ws = new WebSocket(url);

const timeout = setTimeout(() => {
  console.error(JSON.stringify({ ok: false, reason: "timeout", seen, transcript, text, audioBytes }, null, 2));
  ws.close();
  process.exit(2);
}, 20000);

ws.on("open", () => {});

ws.on("message", async (data, isBinary) => {
  if (isBinary) {
    const chunk = Buffer.from(data);
    audioBytes += chunk.length;
    audioChunks.push(chunk);
    return;
  }
  const message = JSON.parse(data.toString("utf8"));
  seen.push(message.type);
  if (message.type === "status" && message.state === "listening" && !sent) {
    sent = true;
    await sendAudioChunks(ws);
  }
  if (message.type === "transcript") transcript = message.text;
  if (message.type === "assistant_text") text = message.text;
  if (message.type === "tool") {
    toolEvents.push(message);
    if (message.phase === "started") toolStarted = true;
    if (message.phase === "result" || message.phase === "dropped") toolSettled = true;
  }
  if (message.type === "tts_end" && toolStarted && toolSettled) finish();
  if (message.type === "llm_end") {
    if (toolStarted && !toolSettled) return;
    if (toolStarted && toolSettled) llmEndAfterTool = true;
    if (toolStarted && !llmEndAfterTool) return;
    finish();
  }
  if (message.type === "error") {
    clearTimeout(timeout);
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    console.error(JSON.stringify({ ok: false, reason: "server-error", message, seen }, null, 2));
    ws.close();
    process.exit(3);
  }
});

function finish() {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  const audio = Buffer.concat(audioChunks);
  const audioStats = getFloat32AudioStats(audio);
  console.log(JSON.stringify({ ok: true, seen, transcript, text, toolEvents, audioBytes, audioFormat: "pcm_f32le", audioStats }, null, 2));
  ws.close();
}

ws.on("error", (error) => {
  clearTimeout(timeout);
  console.error(JSON.stringify({ ok: false, reason: "websocket-error", error: error.message, seen }, null, 2));
  process.exit(4);
});

async function sendAudioChunks(socket) {
  if (!existsSync(audioWavPath)) {
    const aiff = audioWavPath.replace(/\.wav$/i, ".aiff");
    execFileSync("say", ["-o", aiff, "你好，请介绍一下你自己。"]);
    execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@24000", aiff, audioWavPath]);
  }
  const pcm = extractWavData(readFileSync(audioWavPath));
  const chunkBytes = 24000 * 2 / 10;
  for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
    socket.send(pcm.subarray(offset, Math.min(pcm.length, offset + chunkBytes)), { binary: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const silence = Buffer.alloc(chunkBytes);
  for (let i = 0; i < 10; i += 1) {
    socket.send(silence, { binary: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  keepAliveInterval = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) socket.send(silence, { binary: true });
  }, 100);
}

function extractWavData(wav) {
  const dataIndex = wav.indexOf(Buffer.from("data"));
  if (dataIndex < 0) throw new Error("WAV data chunk not found");
  const size = wav.readUInt32LE(dataIndex + 4);
  return wav.subarray(dataIndex + 8, dataIndex + 8 + size);
}

function getFloat32AudioStats(audio) {
  if (audio.length % 4 !== 0) throw new Error(`bridge output length ${audio.length} is not float32-aligned`);
  let peak = 0;
  let sumSquares = 0;
  const samples = audio.length / 4;
  for (let offset = 0; offset < audio.length; offset += 4) {
    const value = audio.readFloatLE(offset);
    if (!Number.isFinite(value)) throw new Error(`bridge output has non-finite float32 at byte ${offset}`);
    peak = Math.max(peak, Math.abs(value));
    sumSquares += value * value;
  }
  const rms = Math.sqrt(sumSquares / Math.max(samples, 1));
  if (samples > 0 && (peak > 1.05 || rms <= 0)) {
    throw new Error(`unexpected bridge float32 output stats peak=${peak} rms=${rms}`);
  }
  return { samples, peak: Number(peak.toFixed(6)), rms: Number(rms.toFixed(6)) };
}
