import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const CLIENT_DEBUG_DIR = path.join(process.cwd(), "logs", "client-debug");

export type ClientDebugLogEntry = {
  sessionId: string;
  at: string;
  level: "debug" | "info" | "warn" | "error";
  event: string;
  message?: string;
  data?: unknown;
};

export async function appendClientDebugLog(entry: ClientDebugLogEntry) {
  await mkdir(CLIENT_DEBUG_DIR, { recursive: true });
  const day = entry.at.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const file = path.join(CLIENT_DEBUG_DIR, `${day}.jsonl`);
  await appendFile(file, `${JSON.stringify(entry)}\n`, "utf8");
  return file;
}
