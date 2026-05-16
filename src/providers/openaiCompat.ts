import type { AppConfig } from "../config.js";
import { StageError } from "../errors.js";
import type { LlmProvider } from "./types.js";

export class OpenAiCompatLlmProvider implements LlmProvider {
  constructor(private readonly config: AppConfig["llm"]) {}

  async reply(input: Parameters<LlmProvider["reply"]>[0]): Promise<string> {
    if (!this.config.apiKey) {
      throw new StageError("config", "Missing LLM_API_KEY or DEEPSEEK_API_KEY", undefined, 400);
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
        "x-request-id": input.requestId
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.6,
        max_tokens: 180,
        messages: [
          { role: "system", content: this.config.systemPrompt },
          ...input.history,
          { role: "user", content: input.transcript }
        ]
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
      throw new StageError("llm", `LLM request failed with HTTP ${response.status}`, json);
    }

    const content = extractAssistantText(json);
    if (!content) {
      throw new StageError("llm", "LLM response did not contain assistant content", json);
    }
    return content.trim();
  }
}

function extractAssistantText(json: unknown) {
  if (!json || typeof json !== "object") return "";
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  const first = choices[0] as { message?: { content?: unknown }; text?: unknown } | undefined;
  if (typeof first?.message?.content === "string") return first.message.content;
  if (typeof first?.text === "string") return first.text;
  return "";
}
