#!/usr/bin/env node
import WebSocket from "ws";

const port = process.env.PORT || "5188";
const url = process.env.NAVIGATION_PROGRESS_SMOKE_URL || `ws://127.0.0.1:${port}/api/realtime`;
const timeoutMs = Number(process.env.NAVIGATION_PROGRESS_SMOKE_TIMEOUT_MS || 8000);

const seen = [];
let progressEcho;
let statusSeen = false;
let finished = false;

const ws = new WebSocket(url);

const timeout = setTimeout(() => {
  fail("timeout");
}, timeoutMs);

ws.on("open", () => {
  ws.send(
    JSON.stringify({
      type: "navigation_progress",
      routeId: "101->202-5",
      startRoomId: "101",
      targetRoomId: "202-5",
      activeLegIndex: 1,
      totalLegs: 9,
      completedLegs: 1,
      remainingLegs: 7,
      totalMeters: 79,
      estimatedSeconds: 117,
      remainingMeters: 74,
      remainingSeconds: 109,
      current: { nodeId: "door-101", label: "101 门口", floor: "1F" },
      next: { nodeId: "c1-101", label: "走廊入口", floor: "1F", kind: "door", distanceMeters: 1, instruction: "出门进入走廊" },
      destination: { roomId: "202-5", label: "202-5 3D 打印", floor: "2F" },
      guidance: {
        phase: "walk",
        userAction: "confirm_next",
        currentSegmentLabel: "101 门口 → 走廊入口",
        nextActionLabel: "到达该节点后点下一步，或说下一步",
        canManualAdvance: true,
        canVoiceAdvance: true
      },
      heading: {
        calibrated: false,
        available: false,
        status: "模拟器没有方向传感器；地图按真实北向显示。"
      },
      ttsPrompt: "第 2 段，从 101 门口 出发，出门进入走廊，到 走廊入口，约 1 米。之后还剩 7 段，约 74 米。",
      announce: false,
      reason: "smoke"
    })
  );
});

ws.on("message", (data, isBinary) => {
  if (isBinary) return;
  const message = JSON.parse(data.toString("utf8"));
  seen.push(message.type);
  if (message.type === "status") statusSeen = true;
  if (message.type === "navigation" && message.phase === "progress") {
    progressEcho = message.progress;
    finish();
  }
  if (message.type === "error") fail("server-error", message);
});

ws.on("error", (error) => fail("websocket-error", { message: error.message }));

function finish() {
  if (finished) return;
  clearTimeout(timeout);
  if (!progressEcho?.guidance?.canVoiceAdvance || !progressEcho?.heading?.status) fail("missing-guidance-or-heading", progressEcho);
  finished = true;
  console.log(
    JSON.stringify(
      {
        ok: true,
        seen,
        statusSeen,
        activeLegIndex: progressEcho.activeLegIndex,
        next: progressEcho.next?.label,
        guidance: progressEcho.guidance,
        heading: progressEcho.heading
      },
      null,
      2
    )
  );
  ws.close();
}

function fail(reason, detail) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  console.error(JSON.stringify({ ok: false, reason, seen, detail }, null, 2));
  ws.close();
  process.exit(2);
}
