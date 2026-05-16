import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { StageError } from "../errors.js";
import type { TtsProvider } from "./types.js";

const execFileAsync = promisify(execFile);

export class MacSayTtsProvider implements TtsProvider {
  async synthesize(input: Parameters<TtsProvider["synthesize"]>[0]) {
    if (process.platform !== "darwin") {
      throw new StageError("tts", "Local TTS fallback requires macOS `say` and `afconvert`");
    }

    const id = randomUUID();
    const aiffPath = path.join(os.tmpdir(), `duplex-${id}.aiff`);
    const wavPath = path.join(os.tmpdir(), `duplex-${id}.wav`);

    try {
      await execFileAsync("say", ["-o", aiffPath, input.text], { timeout: 30000 });
      await execFileAsync("afconvert", ["-f", "WAVE", "-d", "LEI16@22050", aiffPath, wavPath], {
        timeout: 30000
      });
      const wav = await fs.readFile(wavPath);
      return {
        audioBase64: wav.toString("base64"),
        mimeType: "audio/wav"
      };
    } catch (error) {
      throw new StageError("tts", "Local macOS TTS fallback failed", error);
    } finally {
      await Promise.all([fs.rm(aiffPath, { force: true }), fs.rm(wavPath, { force: true })]);
    }
  }
}
