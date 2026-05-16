import type { AppConfig } from "../config.js";
import { StageError } from "../errors.js";
import type { TtsProvider } from "./types.js";

export class VolcengineSseTtsProvider implements TtsProvider {
  constructor(private readonly config: AppConfig["tts"]) {}

  async synthesize(input: Parameters<TtsProvider["synthesize"]>[0]) {
    if (!this.config.apiKey) {
      throw new StageError("config", "Missing VOLCENGINE_TTS_API_KEY or VOLCENGINE_API_KEY", undefined, 400);
    }

    const response = await fetch(this.config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        "x-api-key": this.config.apiKey,
        "x-api-resource-id": this.config.resourceId,
        "x-api-request-id": input.requestId
      },
      body: JSON.stringify({
        user: { uid: input.uid },
        req_params: {
          text: input.text,
          speaker: this.config.speaker,
          audio_params: {
            format: this.config.format,
            sample_rate: this.config.sampleRate
          }
        }
      })
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new StageError("tts", `TTS request failed with HTTP ${response.status}`, { raw: text });
    }

    const audioChunks = await collectSseAudio(response.body);
    if (audioChunks.length === 0) {
      throw new StageError("tts", "TTS response did not contain audio chunks");
    }

    return {
      audioBase64: Buffer.concat(audioChunks).toString("base64"),
      mimeType: this.config.format === "mp3" ? "audio/mpeg" : `audio/${this.config.format}`
    };
  }
}

export async function collectSseAudio(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = "";
  const chunks: Buffer[] = [];

  for await (const rawChunk of body as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(rawChunk, { stream: true });
    const events = buffer.split(/\n\n/);
    buffer = events.pop() || "";
    for (const event of events) parseSseEvent(event, chunks);
  }

  buffer += decoder.decode();
  if (buffer.trim()) parseSseEvent(buffer, chunks);
  return chunks;
}

function parseSseEvent(event: string, chunks: Buffer[]) {
  const dataLines = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim());

  for (const line of dataLines) {
    if (!line || line === "[DONE]") continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      continue;
    }
    const record = json as { code?: number; message?: string; data?: unknown };
    if (typeof record.code === "number" && ![0, 20000000].includes(record.code)) {
      throw new StageError("tts", `TTS stream failed with code ${record.code}`, record);
    }
    if (typeof record.data === "string" && record.data.length > 0) {
      chunks.push(Buffer.from(record.data, "base64"));
    }
  }
}
