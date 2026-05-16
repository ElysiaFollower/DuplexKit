import type { AsrProvider, ConversationMessage, LlmProvider, TtsProvider } from "./types.js";

export class MockAsrProvider implements AsrProvider {
  async transcribe(): Promise<string> {
    return process.env.DEMO_TRANSCRIPT_TEXT || "这是一个本地 mock 语音输入。";
  }
}

export class MockLlmProvider implements LlmProvider {
  async reply(input: { transcript: string; history: ConversationMessage[] }): Promise<string> {
    const prefix = input.history.length > 0 ? "收到，我接着上一轮说。" : "收到。";
    return `${prefix}你刚才说：${input.transcript}`;
  }
}

export class MockTtsProvider implements TtsProvider {
  async synthesize(): Promise<{ audioBase64: string; mimeType: string }> {
    return {
      audioBase64: makeSilentWavBase64(0.45, 16000),
      mimeType: "audio/wav"
    };
  }
}

function makeSilentWavBase64(seconds: number, sampleRate: number) {
  const samples = Math.max(1, Math.floor(seconds * sampleRate));
  const dataBytes = samples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer.toString("base64");
}
