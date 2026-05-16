import type { AppConfig } from "../config.js";
import { StageError } from "../errors.js";
import type { AsrProvider } from "./types.js";

export class VolcengineFlashAsrProvider implements AsrProvider {
  constructor(private readonly config: AppConfig["asr"]) {}

  async transcribe(input: Parameters<AsrProvider["transcribe"]>[0]): Promise<string> {
    if (!this.config.appKey) {
      throw new StageError("config", "Missing VOLCENGINE_ASR_APP_KEY", undefined, 400);
    }

    const response = await fetch(this.config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-app-key": this.config.appKey,
        ...(this.config.accessKey ? { "x-api-access-key": this.config.accessKey } : {}),
        "x-api-resource-id": this.config.resourceId,
        "x-api-request-id": input.requestId,
        "x-api-sequence": "-1"
      },
      body: JSON.stringify({
        user: { uid: input.uid },
        audio: {
          data: input.audioBase64,
          format: inferAudioFormat(input.mimeType),
          codec: "raw",
          rate: 16000,
          bits: 16,
          channel: 1
        },
        additions: {
          language: "zh-CN",
          use_itn: "true",
          use_punc: "true",
          use_ddc: "true"
        }
      })
    });

    const text = await response.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!response.ok) {
      throw new StageError("asr", `ASR request failed with HTTP ${response.status}`, json);
    }

    const transcript = extractTranscript(json);
    if (!transcript) {
      throw new StageError("asr", "ASR response did not contain transcript text", json);
    }
    return transcript.trim();
  }
}

export function inferAudioFormat(mimeType: string) {
  const lower = mimeType.toLowerCase();
  if (lower.includes("mp3") || lower.includes("mpeg")) return "mp3";
  if (lower.includes("ogg")) return "ogg";
  if (lower.includes("wav") || lower.includes("wave")) return "wav";
  return "wav";
}

export function extractTranscript(value: unknown): string {
  const candidates: string[] = [];
  walk(value, candidates);
  return candidates
    .map((item) => item.trim())
    .filter(Boolean)
    .join("")
    .trim();
}

function walk(value: unknown, candidates: string[]) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, candidates);
    return;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["text", "utterance", "transcript"]) {
    const item = record[key];
    if (typeof item === "string") candidates.push(item);
  }
  for (const child of Object.values(record)) walk(child, candidates);
}
