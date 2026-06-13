import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const RealtimeDebugFixtureRequest = z.object({
  fixture: z.enum(["open-map", "navigate-beijing-south", "smalltalk-no-tool", "cancel-no-running-tool"]),
  silenceMs: z.number().int().min(0).max(3000).optional()
});

export type RealtimeDebugFixtureRequest = z.infer<typeof RealtimeDebugFixtureRequest>;

export async function loadRealtimeDebugFixturePcm(fixture: RealtimeDebugFixtureRequest["fixture"]) {
  const wav = await readFile(path.join(process.cwd(), "tests", "assets", `${fixture}.wav`));
  return extractWavData(wav);
}

function extractWavData(wav: Buffer) {
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("WAV fixture must be RIFF/WAVE");
  }

  let offset = 12;
  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (offset + 8 + size > wav.length) throw new Error("Invalid WAV chunk size");
    if (chunkId === "fmt ") validateFormat(wav, offset);
    if (chunkId === "data") return wav.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV data chunk not found");
}

function validateFormat(wav: Buffer, offset: number) {
  const audioFormat = wav.readUInt16LE(offset + 8);
  const channels = wav.readUInt16LE(offset + 10);
  const sampleRate = wav.readUInt32LE(offset + 12);
  const bitsPerSample = wav.readUInt16LE(offset + 22);
  if (audioFormat !== 1 || channels !== 1 || sampleRate !== 24000 || bitsPerSample !== 16) {
    throw new Error(`WAV fixture must be pcm_s16le mono 24000Hz, got format=${audioFormat} channels=${channels} sampleRate=${sampleRate} bits=${bitsPerSample}`);
  }
}
