export const SAMPLE_RATE = 24000;

export function downsample(input: Float32Array, inputRate: number, outputRate = SAMPLE_RATE): Float32Array {
  if (inputRate === outputRate) return input.slice();
  if (inputRate < outputRate) {
    throw new Error(`Input sample rate ${inputRate} is lower than required ${outputRate}`);
  }

  const ratio = inputRate / outputRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += 1) {
      sum += input[j] ?? 0;
      count += 1;
    }
    output[i] = count ? sum / count : 0;
  }

  return output;
}

export function floatToInt16Buffer(input: Float32Array): ArrayBuffer {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, input[i] ?? 0));
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return output.buffer;
}

export function rms(input: Float32Array): number {
  if (!input.length) return 0;
  let sum = 0;
  for (let i = 0; i < input.length; i += 1) {
    const value = input[i] ?? 0;
    sum += value * value;
  }
  return Math.sqrt(sum / input.length);
}

export class PcmFloat32Player {
  private context: AudioContext;
  private playbackAt = 0;
  private nodes = new Set<AudioBufferSourceNode>();

  constructor(context: AudioContext) {
    this.context = context;
    this.playbackAt = context.currentTime;
  }

  play(bytes: ArrayBuffer): void {
    if (!bytes.byteLength) return;
    const input = new Float32Array(bytes);
    const buffer = this.context.createBuffer(1, input.length, SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < input.length; i += 1) {
      channel[i] = Math.max(-1, Math.min(1, input[i] ?? 0));
    }

    const node = this.context.createBufferSource();
    node.buffer = buffer;
    node.connect(this.context.destination);
    this.nodes.add(node);
    node.addEventListener("ended", () => this.nodes.delete(node), { once: true });
    const startAt = Math.max(this.context.currentTime + 0.02, this.playbackAt);
    node.start(startAt);
    this.playbackAt = startAt + buffer.duration;
  }

  clear(): void {
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {
        // Already stopped.
      }
    }
    this.nodes.clear();
    this.playbackAt = this.context.currentTime;
  }
}
