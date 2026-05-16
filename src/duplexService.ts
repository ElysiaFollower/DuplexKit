import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AsrProvider, ConversationMessage, LlmProvider, TtsProvider } from "./providers/types.js";

const TurnInput = z.object({
  audioBase64: z.string().min(16),
  mimeType: z.string().min(1).default("audio/wav"),
  sessionId: z.string().min(1).default("default"),
  clientTurnId: z.string().min(1).optional()
});

const TextTurnInput = z.object({
  text: z.string().trim().min(1).max(4000),
  sessionId: z.string().min(1).default("default"),
  clientTurnId: z.string().min(1).optional()
});

export type TurnInput = z.infer<typeof TurnInput>;
export type TextTurnInput = z.infer<typeof TextTurnInput>;

export class DuplexService {
  private readonly sessions = new Map<string, ConversationMessage[]>();

  constructor(
    private readonly providers: {
      asr: AsrProvider;
      llm: LlmProvider;
      tts: TtsProvider;
    }
  ) {}

  async handleTurn(rawInput: unknown) {
    const input = TurnInput.parse(rawInput);
    const requestId = randomUUID();
    const uid = input.sessionId;
    const startedAt = performance.now();

    const transcript = await this.providers.asr.transcribe({
      audioBase64: input.audioBase64,
      mimeType: input.mimeType,
      requestId,
      uid
    });

    return await this.completeTextTurn({
      transcript,
      sessionId: input.sessionId,
      clientTurnId: input.clientTurnId || null,
      requestId,
      uid,
      startedAt
    });
  }

  async handleTextTurn(rawInput: unknown) {
    const input = TextTurnInput.parse(rawInput);
    const requestId = randomUUID();
    const uid = input.sessionId;
    const startedAt = performance.now();

    return await this.completeTextTurn({
      transcript: input.text,
      sessionId: input.sessionId,
      clientTurnId: input.clientTurnId || null,
      requestId,
      uid,
      startedAt
    });
  }

  resetSession(sessionId: string) {
    this.sessions.delete(sessionId);
  }

  private async completeTextTurn(input: {
    transcript: string;
    sessionId: string;
    clientTurnId: string | null;
    requestId: string;
    uid: string;
    startedAt: number;
  }) {
    const history = this.sessions.get(input.sessionId) || [];
    const reply = await this.providers.llm.reply({
      transcript: input.transcript,
      history,
      requestId: input.requestId
    });
    const audio = await this.providers.tts.synthesize({
      text: reply,
      requestId: input.requestId,
      uid: input.uid
    });

    const nextHistory = [
      ...history,
      { role: "user" as const, content: input.transcript },
      { role: "assistant" as const, content: reply }
    ].slice(-8);
    this.sessions.set(input.sessionId, nextHistory);

    return {
      requestId: input.requestId,
      sessionId: input.sessionId,
      clientTurnId: input.clientTurnId,
      transcript: input.transcript,
      reply,
      audio,
      timings: {
        totalMs: Math.round(performance.now() - input.startedAt)
      }
    };
  }
}
