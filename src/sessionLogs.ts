import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const DialogueEntry = z.object({
  id: z.string(),
  at: z.string(),
  role: z.string(),
  text: z.string(),
  error: z.boolean().optional()
});

const FlowEntry = z.object({
  at: z.string(),
  kind: z.string(),
  payload: z.unknown()
});

export const SessionLogPayload = z
  .object({
    clientCreatedAt: z.string().optional(),
    savedAtClient: z.string().optional(),
    url: z.string().optional(),
    userAgent: z.string().optional(),
    state: z.string().optional(),
    health: z.string().optional(),
    modeHint: z.string().optional(),
    runtimeSettings: z.unknown().optional(),
    tools: z.unknown().optional(),
    dialogue: z.array(DialogueEntry).max(1000).default([]),
    flow: z.array(FlowEntry).max(2000).default([])
  })
  .passthrough();

export type SessionLogPayload = z.infer<typeof SessionLogPayload>;

export async function saveSessionLog(payload: SessionLogPayload, root = process.cwd()) {
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const dir = path.join(root, "logs", "session");
  const filename = `${id}.json`;
  const filePath = path.join(dir, filename);
  const record = {
    schemaVersion: 1,
    id,
    savedAt: new Date().toISOString(),
    payload
  };

  await mkdir(dir, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

  return {
    id,
    filename,
    path: filePath
  };
}
