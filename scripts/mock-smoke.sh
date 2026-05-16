#!/usr/bin/env sh
# 职责：启动 mock 服务并验证静态页、health、语音回合接口和文本回合接口。

set -eu

port=${PORT:-5188}
log_file=${TMPDIR:-/tmp}/duplex-mock-smoke.log

npm run build >/dev/null

DEMO_MOCK=1 PORT="$port" npm start >"$log_file" 2>&1 &
pid=$!
cleanup() {
  kill "$pid" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

ready=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.2
done

if [ "$ready" != "1" ]; then
  echo "mock service did not become ready; log follows" >&2
  cat "$log_file" >&2
  exit 1
fi

curl -fsS "http://127.0.0.1:$port/" | grep -q "Duplex Voice Demo"

node --input-type=module <<'JS'
const port = process.env.PORT || "5188";
const base = `http://127.0.0.1:${port}`;
const audioBase64 = Buffer.alloc(64).toString("base64");

for (const [path, body] of [
  ["/api/turn", { sessionId: "smoke", mimeType: "audio/wav", audioBase64 }],
  ["/api/text-turn", { sessionId: "smoke", text: "mock text smoke" }]
]) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`${path} failed with HTTP ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  if (!data.transcript || !data.reply || !data.audio?.audioBase64) {
    throw new Error(`${path} returned incomplete payload`);
  }
}
JS

echo "mock smoke passed on http://127.0.0.1:$port"
