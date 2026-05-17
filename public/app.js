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

let audioContext;
let source;
let processor;
let mediaStream;
let socket;
let running = false;
let playbackAt = 0;
let currentYou;
let currentAssistant;

const upstreamSampleRate = 24000;

startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);
resetBtn.addEventListener("click", reset);

checkHealth();

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    const missing = data.config?.missing || [];
    healthEl.textContent = missing.length ? `missing: ${missing.join(", ")}` : "ready; native realtime";
  } catch (error) {
    healthEl.textContent = `health failed: ${error.message}`;
  }
}

async function start() {
  setState("starting");
  startBtn.disabled = true;
  stopBtn.disabled = false;
  try {
    await startAudio();
    await connectRealtime();
  } catch (error) {
    showStartError(error);
  }
}

async function startAudio() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not expose microphone capture. Try Chrome/Safari outside the in-app browser.");
  }
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });
  audioContext = new AudioContext();
  await audioContext.resume();
  playbackAt = audioContext.currentTime;
  source = audioContext.createMediaStreamSource(mediaStream);
  processor = audioContext.createScriptProcessor(2048, 1, 1);
  processor.onaudioprocess = onAudio;
  source.connect(processor);
  processor.connect(audioContext.destination);
  running = true;
}

function connectRealtime() {
  return new Promise((resolve, reject) => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${location.host}/api/realtime`);
    socket.binaryType = "arraybuffer";
    socket.addEventListener("open", () => {
      modeHintEl.textContent = "Native realtime connected. Speak naturally.";
      setState("connected");
      resolve();
    });
    socket.addEventListener("message", handleRealtimeMessage);
    socket.addEventListener("error", () => reject(new Error("Realtime WebSocket failed")));
    socket.addEventListener("close", () => {
      if (running) {
        appendTurn("Error", "Realtime WebSocket closed", true);
        stop();
      }
    });
  });
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
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "stop" }));
  socket?.close();
  socket = null;
  processor?.disconnect();
  source?.disconnect();
  mediaStream?.getTracks().forEach((track) => track.stop());
  processor = null;
  source = null;
  mediaStream = null;
  audioContext?.close().catch(() => {});
  audioContext = null;
  currentYou = null;
  currentAssistant = null;
  modeHintEl.textContent = "";
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

function reset() {
  logEl.innerHTML = "";
  currentYou = null;
  currentAssistant = null;
}

function onAudio(event) {
  if (!running || socket?.readyState !== WebSocket.OPEN || !audioContext) return;
  const input = event.inputBuffer.getChannelData(0);
  const rms = Math.sqrt(input.reduce((sum, value) => sum + value * value, 0) / input.length);
  updateMeters(rms);
  const downsampled = downsample(input, audioContext.sampleRate, upstreamSampleRate);
  socket.send(floatToInt16Buffer(downsampled));
}

function updateMeters(rms) {
  const percent = Math.min(100, Math.round(rms * 520));
  levelEl.value = percent / 100;
  floatingLevelEl.style.width = `${percent}%`;
  floatingLevelEl.classList.toggle("hot", percent > 70);
  floatingLevelTextEl.textContent = `${percent}%`;
}

async function handleRealtimeMessage(event) {
  if (typeof event.data !== "string") {
    const bytes = event.data instanceof Blob ? await event.data.arrayBuffer() : event.data;
    playPcm(bytes);
    return;
  }
  const message = JSON.parse(event.data);
  if (message.type === "status") setState(message.state);
  if (message.type === "error") {
    appendTurn("Error", message.message, true);
    setState("error");
  }
  if (message.type === "asr_start") setState("listening");
  if (message.type === "transcript") updateYou(message.text);
  if (message.type === "asr_end") setState("thinking");
  if (message.type === "tts_start") {
    setState("speaking");
    ensureAssistant();
  }
  if (message.type === "assistant_text") updateAssistant(message.text);
  if (message.type === "tts_end" || message.type === "llm_end") setState("listening");
}

function playPcm(arrayBuffer) {
  if (!audioContext || arrayBuffer.byteLength === 0) return;
  const input = new Float32Array(arrayBuffer);
  const buffer = audioContext.createBuffer(1, input.length, upstreamSampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < input.length; i += 1) channel[i] = Math.max(-1, Math.min(1, input[i]));
  const node = audioContext.createBufferSource();
  node.buffer = buffer;
  node.connect(audioContext.destination);
  const startAt = Math.max(audioContext.currentTime + 0.02, playbackAt);
  node.start(startAt);
  playbackAt = startAt + buffer.duration;
}

function updateYou(text) {
  if (!currentYou) currentYou = appendTurn("You", "");
  currentYou.querySelector("div").textContent = text;
}

function ensureAssistant() {
  if (!currentAssistant) currentAssistant = appendTurn("Assistant", "");
  return currentAssistant;
}

function updateAssistant(text) {
  ensureAssistant().querySelector("div").textContent = text;
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
  return item;
}

function downsample(input, inRate, outRate) {
  if (inRate === outRate) return new Float32Array(input);
  const ratio = inRate / outRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) output[i] = input[Math.floor(i * ratio)];
  return output;
}

function floatToInt16Buffer(samples) {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (const sample of samples) {
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}
