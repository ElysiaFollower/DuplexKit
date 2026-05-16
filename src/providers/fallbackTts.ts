import type { TtsProvider } from "./types.js";

export class FallbackTtsProvider implements TtsProvider {
  constructor(
    private readonly primary: TtsProvider,
    private readonly fallback: TtsProvider
  ) {}

  async synthesize(input: Parameters<TtsProvider["synthesize"]>[0]) {
    try {
      return await this.primary.synthesize(input);
    } catch {
      return await this.fallback.synthesize(input);
    }
  }
}
