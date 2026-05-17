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
let sent = false;
const seen = [];

const ws = new WebSocket(url);

const timeout = setTimeout(() => {
  console.error(JSON.stringify({ ok: false, reason: "timeout", seen, transcript, text, audioBytes }, null, 2));
  ws.close();
  process.exit(2);
}, 20000);

ws.on("open", () => {});

ws.on("message", async (data, isBinary) => {
  if (isBinary) {
    audioBytes += Buffer.byteLength(data);
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
  if (message.type === "llm_end") {
    clearTimeout(timeout);
    console.log(JSON.stringify({ ok: true, seen, transcript, text, audioBytes }, null, 2));
    ws.close();
  }
  if (message.type === "error") {
    clearTimeout(timeout);
    console.error(JSON.stringify({ ok: false, reason: "server-error", message, seen }, null, 2));
    ws.close();
    process.exit(3);
  }
});

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
}

function extractWavData(wav) {
  const dataIndex = wav.indexOf(Buffer.from("data"));
  if (dataIndex < 0) throw new Error("WAV data chunk not found");
  const size = wav.readUInt32LE(dataIndex + 4);
  return wav.subarray(dataIndex + 8, dataIndex + 8 + size);
}
