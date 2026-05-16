const startBtn = document.querySelector("#startBtn");
const stopBtn = document.querySelector("#stopBtn");
const resetBtn = document.querySelector("#resetBtn");
const stateEl = document.querySelector("#state");
const levelEl = document.querySelector("#level");
const logEl = document.querySelector("#log");
const healthEl = document.querySelector("#health");
const textInput = document.querySelector("#textInput");
const sendTextBtn = document.querySelector("#sendTextBtn");

const sessionId = crypto.randomUUID();
let audioContext;
let source;
let processor;
let mediaStream;
let recognition;
let running = false;
let speaking = false;
let segment = [];
let preRoll = [];
let silenceMs = 0;
let currentAudio = null;
let browserAsrMode = false;
let healthMissingAsr = false;

const sampleRate = 16000;
const frameMs = 2048 / 48000 * 1000;
const vadThreshold = 0.018;
const silenceToSubmitMs = 850;
const minSpeechMs = 280;
let speechMs = 0;

startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);
resetBtn.addEventListener("click", reset);
sendTextBtn.addEventListener("click", submitText);
textInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitText();
});

checkHealth();

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    const missing = data.config?.missing || [];
    healthMissingAsr = missing.includes("VOLCENGINE_ASR_APP_KEY");
    const browserAsrAvailable = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
    healthEl.textContent = missing.length
      ? `missing: ${missing.join(", ")}${healthMissingAsr && browserAsrAvailable ? "; browser ASR fallback available" : ""}`
      : "ready";
  } catch (error) {
    healthEl.textContent = `health failed: ${error.message}`;
  }
}

async function start() {
  if (healthMissingAsr && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
    startBrowserAsr();
    return;
  }
  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioContext = new AudioContext();
  source = audioContext.createMediaStreamSource(mediaStream);
  processor = audioContext.createScriptProcessor(2048, 1, 1);
  processor.onaudioprocess = onAudio;
  source.connect(processor);
  processor.connect(audioContext.destination);
  running = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  setState("listening");
}

function stop() {
  running = false;
  recognition?.stop();
  recognition = null;
  browserAsrMode = false;
  processor?.disconnect();
  source?.disconnect();
  mediaStream?.getTracks().forEach((track) => track.stop());
  stopPlayback("stopped");
  resetBuffers();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  setState("idle");
}

function startBrowserAsr() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new Recognition();
  recognition.lang = "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.onstart = () => {
    running = true;
    browserAsrMode = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    setState("listening-browser-asr");
  };
  recognition.onaudiostart = () => {
    if (currentAudio) stopPlayback("interrupted");
  };
  recognition.onresult = (event) => {
    const latest = event.results[event.results.length - 1];
    if (!latest?.isFinal) return;
    const text = latest[0]?.transcript?.trim();
    if (text) sendTextTurn(text);
  };
  recognition.onerror = (event) => {
    appendTurn("Error", `Browser ASR failed: ${event.error}`, true);
    setState("idle");
  };
  recognition.onend = () => {
    if (running && browserAsrMode) recognition.start();
  };
  recognition.start();
}

async function reset() {
  await fetch(`/api/session/${sessionId}/reset`, { method: "POST" }).catch(() => {});
  logEl.innerHTML = "";
}

function onAudio(event) {
  if (!running) return;
  const input = event.inputBuffer.getChannelData(0);
  const rms = Math.sqrt(input.reduce((sum, value) => sum + value * value, 0) / input.length);
  levelEl.value = Math.min(1, rms * 18);
  const downsampled = downsample(input, audioContext.sampleRate, sampleRate);

  preRoll.push(downsampled);
  if (preRoll.length > 8) preRoll.shift();

  if (rms > vadThreshold) {
    if (currentAudio) stopPlayback("interrupted");
    if (!speaking) {
      speaking = true;
      segment = [...preRoll];
      speechMs = 0;
      setState("recording");
    }
    segment.push(downsampled);
    silenceMs = 0;
    speechMs += frameMs;
    return;
  }

  if (speaking) {
    segment.push(downsampled);
    silenceMs += frameMs;
    if (silenceMs >= silenceToSubmitMs) {
      const captured = flatten(segment);
      const longEnough = speechMs >= minSpeechMs;
      resetBuffers();
      if (longEnough) submitAudio(captured);
    }
  }
}

async function submitAudio(samples) {
  setState("uploading");
  try {
    const wav = encodeWav(samples, sampleRate);
    const audioBase64 = arrayBufferToBase64(wav);
    setState("thinking");
    const response = await fetch("/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        clientTurnId: crypto.randomUUID(),
        mimeType: "audio/wav",
        audioBase64
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`);
    appendTurn("You", data.transcript);
    appendTurn("Assistant", data.reply);
    playAudio(data.audio.audioBase64, data.audio.mimeType);
  } catch (error) {
    appendTurn("Error", error.message, true);
    setState("listening");
  }
}

async function submitText() {
  const text = textInput.value.trim();
  if (!text) return;
  await sendTextTurn(text);
}

async function sendTextTurn(text) {
  stopPlayback("interrupted");
  textInput.value = "";
  setState("thinking");
  try {
    const response = await fetch("/api/text-turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        clientTurnId: crypto.randomUUID(),
        text
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`);
    appendTurn("You", data.transcript);
    appendTurn("Assistant", data.reply);
    playAudio(data.audio.audioBase64, data.audio.mimeType);
  } catch (error) {
    appendTurn("Error", error.message, true);
    setState(running ? "listening" : "idle");
  }
}

function playAudio(base64, mimeType) {
  stopPlayback("interrupted");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  currentAudio = new Audio(url);
  currentAudio.onended = () => {
    URL.revokeObjectURL(url);
    currentAudio = null;
    setState("listening");
  };
  currentAudio.play();
  setState("speaking");
}

function stopPlayback(reason) {
  if (!currentAudio) return;
  currentAudio.pause();
  currentAudio.currentTime = 0;
  currentAudio = null;
  setState(reason);
}

function resetBuffers() {
  speaking = false;
  segment = [];
  silenceMs = 0;
  speechMs = 0;
}

function setState(value) {
  stateEl.textContent = value;
}

function appendTurn(role, text, error = false) {
  const item = document.createElement("article");
  item.className = `turn${error ? " error" : ""}`;
  item.innerHTML = `<strong></strong><div></div>`;
  item.querySelector("strong").textContent = role;
  item.querySelector("div").textContent = text;
  logEl.prepend(item);
}

function downsample(input, inRate, outRate) {
  if (inRate === outRate) return new Float32Array(input);
  const ratio = inRate / outRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    output[i] = input[Math.floor(i * ratio)];
  }
  return output;
}

function flatten(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function encodeWav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (const sample of samples) {
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

function writeString(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
