const startBtn = document.querySelector("#startBtn");
const stopBtn = document.querySelector("#stopBtn");
const resetBtn = document.querySelector("#resetBtn");
const stateEl = document.querySelector("#state");
const levelEl = document.querySelector("#level");
const dialogueLogEl = document.querySelector("#dialogueLog");
const healthEl = document.querySelector("#health");
const modeHintEl = document.querySelector("#modeHint");
const floatingLevelEl = document.querySelector("#floatingLevel");
const floatingLevelTextEl = document.querySelector("#floatingLevelText");
const systemRoleInput = document.querySelector("#systemRoleInput");
const speakingStyleInput = document.querySelector("#speakingStyleInput");
const settingsStatusEl = document.querySelector("#settingsStatus");
const saveSettingsBtn = document.querySelector("#saveSettingsBtn");
const flowLogEl = document.querySelector("#flowLog");
const clearFlowBtn = document.querySelector("#clearFlowBtn");
const clearDialogueBtn = document.querySelector("#clearDialogueBtn");
const saveSessionBtn = document.querySelector("#saveSessionBtn");
const saveSessionStatusEl = document.querySelector("#saveSessionStatus");
const toolsPanelEl = document.querySelector("#toolsPanel");
const protocolNotesEl = document.querySelector("#protocolNotes");

const pageCreatedAt = new Date().toISOString();
const dialogueEntries = [];
const flowEntries = [];
const turnEntries = new WeakMap();
let runtimeSettingsSnapshot;
let toolRegistrySnapshot;
let audioContext;
let source;
let processor;
let mediaStream;
let socket;
let running = false;
let playbackAt = 0;
let currentYou;
let currentAssistant;
const playbackNodes = new Set();

const upstreamSampleRate = 24000;

startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);
resetBtn.addEventListener("click", reset);
saveSettingsBtn.addEventListener("click", saveRuntimeSettings);
clearFlowBtn.addEventListener("click", () => {
  flowLogEl.innerHTML = "";
  flowEntries.length = 0;
});
clearDialogueBtn.addEventListener("click", resetDialogue);
saveSessionBtn.addEventListener("click", saveSessionLog);

checkHealth();
loadRuntimeSettings();
loadToolRegistry();

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

async function loadRuntimeSettings() {
  try {
    const response = await fetch("/api/runtime-settings");
    const data = await response.json();
    runtimeSettingsSnapshot = data;
    systemRoleInput.value = data.settings?.systemRole || "";
    speakingStyleInput.value = data.settings?.speakingStyle || "";
    settingsStatusEl.textContent = data.note || "Changes apply to next Start.";
  } catch (error) {
    settingsStatusEl.textContent = `settings failed: ${error.message}`;
  }
}

async function saveRuntimeSettings() {
  settingsStatusEl.textContent = "saving";
  const response = await fetch("/api/runtime-settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemRole: systemRoleInput.value,
      speakingStyle: speakingStyleInput.value
    })
  });
  if (!response.ok) {
    settingsStatusEl.textContent = `save failed: ${response.status}`;
    return;
  }
  const data = await response.json();
  runtimeSettingsSnapshot = data;
  systemRoleInput.value = data.settings.systemRole;
  speakingStyleInput.value = data.settings.speakingStyle;
  settingsStatusEl.textContent = "saved; next Start uses it";
}

async function loadToolRegistry() {
  try {
    const response = await fetch("/api/tools");
    const data = await response.json();
    toolRegistrySnapshot = data;
    renderTools(data);
  } catch (error) {
    toolsPanelEl.textContent = `tools failed: ${error.message}`;
    protocolNotesEl.textContent = "";
  }
}

function renderTools(data) {
  toolsPanelEl.innerHTML = "";
  protocolNotesEl.innerHTML = "";
  for (const tool of data.tools || []) {
    const item = document.createElement("details");
    item.className = "tool-item";
    item.open = true;
    item.innerHTML = `<summary></summary><p></p><pre></pre><small></small>`;
    item.querySelector("summary").textContent = `${tool.name}${tool.status ? ` · ${tool.status}` : ""}`;
    item.querySelector("p").textContent = tool.description;
    item.querySelector("pre").textContent = JSON.stringify(tool.parameters, null, 2);
    item.querySelector("small").textContent = `examples: ${(tool.examples || []).join(" / ")}`;
    toolsPanelEl.appendChild(item);
  }

  for (const template of data.promptTemplates || []) {
    const row = document.createElement("p");
    row.textContent = `${template.name} · ${template.channel} · ${template.purpose}`;
    protocolNotesEl.appendChild(row);
  }
}

async function saveSessionLog() {
  saveSessionBtn.disabled = true;
  saveSessionStatusEl.textContent = "saving";
  try {
    const response = await fetch("/api/session-logs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(collectSessionLog())
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `save failed: ${response.status}`);
    saveSessionStatusEl.textContent = `saved: ${data.filename}`;
    addFlow("session_log_saved", data);
  } catch (error) {
    saveSessionStatusEl.textContent = `save failed: ${error.message}`;
  } finally {
    saveSessionBtn.disabled = false;
  }
}

function collectSessionLog() {
  return {
    clientCreatedAt: pageCreatedAt,
    savedAtClient: new Date().toISOString(),
    url: location.href,
    userAgent: navigator.userAgent,
    state: stateEl.textContent,
    health: healthEl.textContent,
    modeHint: modeHintEl.textContent,
    runtimeSettings: {
      loaded: runtimeSettingsSnapshot,
      editor: {
        systemRole: systemRoleInput.value,
        speakingStyle: speakingStyleInput.value
      }
    },
    tools: toolRegistrySnapshot,
    dialogue: dialogueEntries,
    flow: flowEntries
  };
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
      addFlow("socket", "open");
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
  clearPlayback();
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
  resetDialogue();
}

function resetDialogue() {
  dialogueLogEl.innerHTML = "";
  dialogueEntries.length = 0;
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
  if (message.type === "asr_start") {
    clearPlayback();
    currentYou = null;
    currentAssistant = null;
    addFlow("interrupt", { questionId: message.questionId });
    setState("listening");
  }
  if (message.type === "transcript") {
    updateYou(message.text);
    addFlow("transcript", { text: message.text, questionId: message.questionId });
  }
  if (message.type === "asr_end") {
    addFlow("asr_end", { questionId: message.questionId });
    setState("thinking");
  }
  if (message.type === "tts_start") {
    if (message.suppressed) {
      addFlow("tts_suppressed", message);
      return;
    }
    addFlow("tts_start", message);
    setState("speaking");
    ensureAssistant();
  }
  if (message.type === "assistant_text") {
    updateAssistant(message.text);
    addFlow("assistant_text", { text: message.text });
  }
  if (message.type === "tts_end" || message.type === "llm_end") setState("listening");
  if (message.type === "planner") {
    addFlow("planner", { transcript: message.transcript, decision: message.decision });
  }
  if (message.type === "tool") {
    addFlow("tool", message);
  }
  if (message.type === "raw_event") {
    addFlow("volc", message);
    console.debug("realtime event", message);
  }
}

function addFlow(kind, payload) {
  const entry = {
    at: new Date().toISOString(),
    kind,
    payload
  };
  flowEntries.push(entry);
  while (flowEntries.length > 500) flowEntries.shift();

  const item = document.createElement("div");
  item.className = "flow-item";
  const time = new Date(entry.at).toLocaleTimeString();
  item.innerHTML = `<strong></strong><pre></pre>`;
  item.querySelector("strong").textContent = `${time} ${kind}`;
  item.querySelector("pre").textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  flowLogEl.prepend(item);
  while (flowLogEl.children.length > 120) flowLogEl.lastElementChild?.remove();
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
  playbackNodes.add(node);
  node.addEventListener("ended", () => playbackNodes.delete(node), { once: true });
  const startAt = Math.max(audioContext.currentTime + 0.02, playbackAt);
  node.start(startAt);
  playbackAt = startAt + buffer.duration;
}

function clearPlayback() {
  for (const node of playbackNodes) {
    try {
      node.stop();
    } catch {
      // already stopped
    }
  }
  playbackNodes.clear();
  if (audioContext) playbackAt = audioContext.currentTime;
}

function updateYou(text) {
  if (!currentYou) currentYou = appendTurn("You", "");
  updateTurnText(currentYou, text);
}

function ensureAssistant() {
  if (!currentAssistant) currentAssistant = appendTurn("Assistant", "");
  return currentAssistant;
}

function updateAssistant(text) {
  updateTurnText(ensureAssistant(), text);
}

function setState(value) {
  stateEl.textContent = value;
}

function appendTurn(role, text, error = false) {
  const entry = {
    id: newTurnId(),
    at: new Date().toISOString(),
    role,
    text,
    error
  };
  dialogueEntries.push(entry);

  const item = document.createElement("article");
  item.className = `turn${error ? " error" : ""}`;
  item.innerHTML = `<strong></strong><div></div>`;
  item.querySelector("strong").textContent = role;
  item.querySelector("div").textContent = text;
  turnEntries.set(item, entry);
  dialogueLogEl.prepend(item);
  return item;
}

function updateTurnText(item, text) {
  item.querySelector("div").textContent = text;
  const entry = turnEntries.get(item);
  if (entry) entry.text = text;
}

function newTurnId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
