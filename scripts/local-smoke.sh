#!/usr/bin/env sh
# 职责：验证本地服务、静态页、health 和 realtime HTTP upgrade 保护。

set -eu

port=${PORT:-5188}
log_file=${TMPDIR:-/tmp}/duplex-local-smoke.log

npm run build >/dev/null

APP_ID=smoke-app ACCESS_TOKEN=smoke-token PORT="$port" npm start >"$log_file" 2>&1 &
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
  echo "local service did not become ready; log follows" >&2
  cat "$log_file" >&2
  exit 1
fi

curl -fsS "http://127.0.0.1:$port/" | grep -q "DuplexKit"
curl -fsS "http://127.0.0.1:$port/api/health" | grep -q "pcm_f32le"

status=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$port/api/realtime")
if [ "$status" != "426" ]; then
  echo "expected /api/realtime HTTP status 426, got $status" >&2
  exit 1
fi

echo "local smoke passed on http://127.0.0.1:$port"
