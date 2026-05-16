export interface AsrProvider {
  transcribe(input: {
    audioBase64: string;
    mimeType: string;
    requestId: string;
    uid: string;
  }): Promise<string>;
}

export interface LlmProvider {
  reply(input: {
    transcript: string;
    history: ConversationMessage[];
    requestId: string;
  }): Promise<string>;
}

export interface TtsProvider {
  synthesize(input: {
    text: string;
    requestId: string;
    uid: string;
  }): Promise<{ audioBase64: string; mimeType: string }>;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}
