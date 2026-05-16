export type Stage = "config" | "asr" | "llm" | "tts" | "request";

export class StageError extends Error {
  constructor(
    public readonly stage: Stage,
    message: string,
    public readonly details?: unknown,
    public readonly statusCode = 502
  ) {
    super(message);
    this.name = "StageError";
  }
}
