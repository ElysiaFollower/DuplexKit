const startBtn = document.querySelector("#startBtn");
const stopBtn = document.querySelector("#stopBtn");
const resetBtn = document.querySelector("#resetBtn");
const stateEl = document.querySelector("#state");
const levelEl = document.querySelector("#level");
const logEl = document.querySelector("#log");
const healthEl = document.querySelector("#health");
const modeHintEl = document.querySelector("#modeHint");
const floatingLevelEl = document.querySelector("#floatingLevel");
const floatingLevelTextEl = document.querySelector("#floatingLevelText");

const sessionId = crypto.randomUUID();
let audioContext;
let source;
let processor;
let mediaStream;
let running = false;
let speaking = false;
let segment = [];
let preRoll = [];
let silenceMs = 0;
let currentAudio = null;
let calibrated = false;
let noiseSamples = [];
let noiseFloor = 0;
let activeThreshold = 0.018;
let hotMs = 0;

const sampleRate = 16000;
const frameMs = 2048 / 48000 * 1000;
const vadThreshold = 0.018;
const calibrationMs = 1200;
const speechStartMs = 180;
const silenceToSubmitMs = 850;
const minSpeechMs = 280;
let speechMs = 0;

startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);
resetBtn.addEventListener("click", reset);

checkHealth();

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    const missing = data.config?.missing || [];
    healthEl.textContent = missing.length ? `missing: ${missing.join(", ")}` : "ready; Web Audio VAD";
  } catch (error) {
    healthEl.textContent = `health failed: ${error.message}`;
  }
}

async function start() {
  setState("starting");
  startBtn.disabled = true;
  stopBtn.disabled = false;
  await startAudioVad().catch((error) => showStartError(error));
}

async function startAudioVad() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not expose microphone capture. Try Chrome/Safari outside the in-app browser.");
  }
  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioContext = new AudioContext();
  source = audioContext.createMediaStreamSource(mediaStream);
  processor = audioContext.createScriptProcessor(2048, 1, 1);
  processor.onaudioprocess = onAudio;
  source.connect(processor);
  processor.connect(audioContext.destination);
  running = true;
  calibrated = false;
  noiseSamples = [];
  noiseFloor = 0;
  activeThreshold = vadThreshold;
  hotMs = 0;
  modeHintEl.textContent = "Calibrating room noise. Stay quiet for about 1 second.";
  setState("calibrating-noise");
}

function showStartError(error) {
  appendTurn("Start failed", error.message || String(error), true);
  running = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  setState("idle");
}

function stop() {
  running = false;
  processor?.disconnect();
  source?.disconnect();
  mediaStream?.getTracks().forEach((track) => track.stop());
  processor = null;
  source = null;
  mediaStream = null;
  audioContext?.close().catch(() => {});
  audioContext = null;
  modeHintEl.textContent = "";
  stopPlayback("stopped");
  resetBuffers();
  resetFloatingMeter();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  setState("idle");
}

function resetFloatingMeter() {
  floatingLevelEl.style.width = "0%";
  floatingLevelEl.classList.remove("hot");
  floatingLevelTextEl.textContent = "0%";
}

async function reset() {
  await fetch(`/api/session/${sessionId}/reset`, { method: "POST" }).catch(() => {});
  logEl.innerHTML = "";
}

function onAudio(event) {
  if (!running) return;
  const input = event.inputBuffer.getChannelData(0);
  const rms = Math.sqrt(input.reduce((sum, value) => sum + value * value, 0) / input.length);
  updateMeters(rms);

  if (!calibrated) {
    noiseSamples.push(rms);
    if (noiseSamples.length * frameMs >= calibrationMs) {
      const sorted = [...noiseSamples].sort((a, b) => a - b);
      noiseFloor = sorted[Math.floor(sorted.length * 0.7)] || 0;
      activeThreshold = Math.max(vadThreshold, noiseFloor * 3);
      calibrated = true;
      modeHintEl.textContent = `Web Audio VAD: threshold ${(activeThreshold * 100).toFixed(1)}%, noise floor ${(noiseFloor * 100).toFixed(1)}%. Speak, then pause.`;
      setState("listening");
    }
    return;
  }

  const downsampled = downsample(input, audioContext.sampleRate, sampleRate);

  preRoll.push(downsampled);
  if (preRoll.length > 8) preRoll.shift();

  if (rms > activeThreshold) {
    hotMs += frameMs;
    if (currentAudio && hotMs >= speechStartMs) stopPlayback("interrupted");
    if (!speaking && hotMs >= speechStartMs) {
      speaking = true;
      segment = [...preRoll];
      speechMs = 0;
      setState("recording");
    }
    if (speaking) segment.push(downsampled);
    silenceMs = 0;
    if (speaking) speechMs += frameMs;
    return;
  }

  hotMs = 0;
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

function updateMeters(rms) {
  const percent = Math.min(100, Math.round(rms * 520));
  levelEl.value = percent / 100;
  floatingLevelEl.style.width = `${percent}%`;
  floatingLevelEl.classList.toggle("hot", percent > 70);
  floatingLevelTextEl.textContent = `${percent}%`;
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
  hotMs = 0;
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
