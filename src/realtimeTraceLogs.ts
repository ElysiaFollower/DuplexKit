import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const REALTIME_TRACE_DIR = path.join("logs", "realtime-trace");

export type RealtimeTraceDirection = "client_to_server" | "server_to_client" | "server_to_upstream" | "upstream_to_server" | "internal";

export type RealtimeTraceLogEntry = {
  sessionId: string;
  at: string;
  direction: RealtimeTraceDirection;
  event: string;
  payload?: unknown;
};

export function realtimeTraceLogPath(at = new Date(), root = process.cwd()) {
  const day = at.toISOString().slice(0, 10);
  return path.join(root, REALTIME_TRACE_DIR, `${day}.jsonl`);
}

export async function appendRealtimeTraceLog(entry: RealtimeTraceLogEntry, root = process.cwd()) {
  const file = realtimeTraceLogPath(new Date(entry.at), root);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(entry)}\n`, "utf8");
  return file;
}
