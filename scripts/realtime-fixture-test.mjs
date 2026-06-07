#!/usr/bin/env node
import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import WebSocket from "ws";

const root = process.cwd();
const assetsDir = path.join(root, "tests", "assets");
const scenariosConfig = JSON.parse(readFileSync(path.join(assetsDir, "scenarios.json"), "utf8"));
const selectedIds = new Set(
  (process.env.REALTIME_FIXTURE_SCENARIOS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const scenarios = (scenariosConfig.scenarios || []).filter((scenario) => selectedIds.size === 0 || selectedIds.has(scenario.id));
const port = Number(process.env.REALTIME_FIXTURE_PORT || 5197);
const url = `ws://127.0.0.1:${port}/api/realtime`;

if (!process.env.VOLCENGINE_REALTIME_APP_ID && !process.env.APP_ID) {
  fail("missing VOLCENGINE_REALTIME_APP_ID or APP_ID");
}
if (!process.env.VOLCENGINE_REALTIME_ACCESS_TOKEN && !process.env.ACCESS_TOKEN) {
  fail("missing VOLCENGINE_REALTIME_ACCESS_TOKEN or ACCESS_TOKEN");
}
if (scenarios.length === 0) {
  fail("no realtime fixture scenarios selected");
}

const server = spawn("npm", ["start"], {
  cwd: root,
  env: { ...process.env, PORT: String(port), NODE_ENV: "test" },
  stdio: ["ignore", "pipe", "pipe"]
});

let serverLog = "";
server.stdout.on("data", (chunk) => {
  serverLog += chunk.toString("utf8");
});
server.stderr.on("data", (chunk) => {
  serverLog += chunk.toString("utf8");
});

process.on("SIGINT", () => cleanup(130));
process.on("SIGTERM", () => cleanup(143));

try {
  await waitForHealth(port);
  const results = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario));
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
  cleanup(0);
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        serverLog: serverLog.slice(-4000)
      },
      null,
      2
    )
  );
  cleanup(1);
}

async function runScenario(scenario) {
  const audioPath = path.join(assetsDir, scenario.audioFile);
  if (!existsSync(audioPath)) {
    throw new Error(`missing audio fixture ${path.relative(root, audioPath)}; run npm run fixtures:audio`);
  }

  const state = {
    id: scenario.id,
    transcript: "",
    assistantText: "",
    assistantMessages: [],
    assistantTurns: [],
    seen: [],
    toolRequests: [],
    toolEvents: [],
    toolResults: [],
    audioBytes: 0,
    llmEnded: false
  };

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let sent = false;
    let keepAliveInterval;
    let settleTimer;
    const timeout = setTimeout(() => done(new Error(`timeout in scenario ${scenario.id}`)), scenario.timeoutMs || 45000);

    ws.on("open", () => {});
    ws.on("message", async (data, isBinary) => {
      if (isBinary) {
        state.audioBytes += Buffer.from(data).length;
        return;
      }

      const message = JSON.parse(data.toString("utf8"));
      state.seen.push(message.type);

      if (message.type === "status" && message.state === "listening" && !sent) {
        sent = true;
        void sendAudioChunks(ws, audioPath).then((interval) => {
          keepAliveInterval = interval;
        }, done);
      }
      if (message.type === "transcript") state.transcript = message.text || state.transcript;
      if (message.type === "assistant_text") {
        const assistantMessage = message.text || message.delta || "";
        if (assistantMessage) state.assistantMessages.push(assistantMessage);
        if (message.text) state.assistantText = message.text;
        if (message.delta) state.assistantText = message.text || `${state.assistantText}${message.delta}`;
        if (message.append) state.assistantTurns.push(message.text || "");
      }
      if (message.type === "llm_end") state.llmEnded = true;
      if (message.type === "tool") {
        state.toolEvents.push(message);
        if (message.phase === "result") state.toolResults.push(message.result);
      }
      if (message.type === "tool_request") {
        state.toolRequests.push(message.request);
        if (scenario.autoAck !== false) {
          const delay = Number(scenario.ackDelayMs || 0);
          setTimeout(() => sendDemoToolResult(ws, message.request), delay);
        }
      }
      if (message.type === "error") done(new Error(`server error in ${scenario.id}: ${message.message}`));

      const assertion = assertScenario(scenario, state, { final: false });
      if (assertion.ok) {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => done(), scenario.settleMs || 1200);
      }
    });

    ws.on("error", (error) => done(error));
    ws.on("close", () => {
      if (!isScenarioSatisfied(scenario, state)) done(new Error(`websocket closed before scenario passed: ${scenario.id}`));
    });

    function done(error) {
      clearTimeout(timeout);
      clearTimeout(settleTimer);
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "stop" }));
      ws.close();
      if (error) reject(error);
      else resolve();
    }
  });

  assertScenario(scenario, state, { final: true });
  return {
    id: scenario.id,
    transcript: state.transcript,
    assistantText: state.assistantText,
    assistantMessages: state.assistantMessages,
    assistantTurns: state.assistantTurns,
    toolRequests: state.toolRequests,
    toolResults: state.toolResults,
    audioBytes: state.audioBytes
  };
}

function assertScenario(scenario, state, { final }) {
  const failures = [];
  const expect = scenario.expect || {};
  const allAssistantText = [state.assistantText, ...state.assistantMessages, ...state.assistantTurns].join("\n");

  if (expect.assistantIncludesAny?.length) {
    const matched = expect.assistantIncludesAny.some((text) => allAssistantText.includes(text));
    if (!matched) failures.push(`assistant text did not include any of: ${expect.assistantIncludesAny.join(", ")}`);
  }

  if (expect.noTool && state.toolRequests.length > 0) {
    failures.push(`expected no tool_request, got ${state.toolRequests.map((request) => request.tool).join(", ")}`);
  }

  if (expect.tool) {
    const request = state.toolRequests.find((item) => item.tool === expect.tool);
    if (!request) {
      failures.push(`expected tool_request ${expect.tool}`);
    } else if (expect.toolArgs?.placeIncludes && !String(request.args?.place || "").includes(expect.toolArgs.placeIncludes)) {
      failures.push(`expected place to include ${expect.toolArgs.placeIncludes}, got ${request.args?.place || ""}`);
    }
  }

  if (expect.toolResultIncludes) {
    const matched = state.toolResults.some((result) => String(result?.summary || "").includes(expect.toolResultIncludes));
    if (!matched) failures.push(`expected tool result summary to include ${expect.toolResultIncludes}`);
  }

  if (expect.toolResultTool) {
    const matched = state.toolResults.some((result) => result?.tool === expect.toolResultTool);
    if (!matched) failures.push(`expected tool result for ${expect.toolResultTool}`);
  }

  if (final && failures.length > 0) {
    throw new Error(`${scenario.id} failed: ${failures.join("; ")}\n${JSON.stringify(state, null, 2)}`);
  }
  return { ok: failures.length === 0, failures };
}

function isScenarioSatisfied(scenario, state) {
  return assertScenario(scenario, state, { final: false }).ok;
}

async function sendAudioChunks(socket, audioPath) {
  const pcm = extractWavData(readFileSync(audioPath));
  const chunkBytes = 24000 * 2 / 10;
  for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
    socket.send(pcm.subarray(offset, Math.min(pcm.length, offset + chunkBytes)), { binary: true });
    await delay(100);
  }
  const silence = Buffer.alloc(chunkBytes);
  for (let i = 0; i < 10; i += 1) {
    socket.send(silence, { binary: true });
    await delay(100);
  }
  return setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) socket.send(silence, { binary: true });
  }, 100);
}

function sendDemoToolResult(socket, request) {
  if (!request?.toolCallId || socket.readyState !== WebSocket.OPEN) return;
  const place = request.args?.place;
  const summaries = {
    "map.open": "地图已打开",
    "map.close": "地图已关闭",
    "map.set_origin": `起点已设置为${place || "指定位置"}`,
    "map.set_destination": `终点已设置为${place || "指定位置"}`,
    "navigation.start": `导航已启动，目的地是${place || "当前终点"}`
  };
  socket.send(
    JSON.stringify({
      type: "tool_result",
      toolCallId: request.toolCallId,
      tool: request.tool,
      status: "success",
      summary: summaries[request.tool] || "工具动作已完成",
      visibleResult: summaries[request.tool] || "工具动作已完成",
      debugNote: "realtime fixture test auto-acknowledged tool_request"
    })
  );
}

function extractWavData(wav) {
  const riff = wav.toString("ascii", 0, 4);
  if (riff !== "RIFF") throw new Error("WAV fixture must be RIFF");
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (chunkId === "fmt ") {
      const audioFormat = wav.readUInt16LE(offset + 8);
      const channels = wav.readUInt16LE(offset + 10);
      const sampleRate = wav.readUInt32LE(offset + 12);
      const bitsPerSample = wav.readUInt16LE(offset + 22);
      if (audioFormat !== 1 || channels !== 1 || sampleRate !== 24000 || bitsPerSample !== 16) {
        throw new Error(`WAV fixture must be pcm_s16le mono 24000Hz, got format=${audioFormat} channels=${channels} sampleRate=${sampleRate} bits=${bitsPerSample}`);
      }
    }
    if (chunkId === "data") return wav.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV data chunk not found");
}

async function waitForHealth(portNumber) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const body = await httpGet(`http://127.0.0.1:${portNumber}/api/health`);
      const health = JSON.parse(body);
      if (health.status === "ok" && health.config?.ok) return;
      throw new Error(`health config not ok: ${body}`);
    } catch {
      await delay(200);
    }
  }
  throw new Error(`local service did not become ready on port ${portNumber}`);
}

function httpGet(target) {
  return new Promise((resolve, reject) => {
    const request = http.get(target, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) resolve(body);
        else reject(new Error(`HTTP ${response.statusCode}: ${body}`));
      });
    });
    request.on("error", reject);
    request.setTimeout(2000, () => {
      request.destroy(new Error("health request timeout"));
    });
  });
}

function cleanup(code) {
  server.kill("SIGTERM");
  process.exit(code);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
