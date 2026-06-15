#!/usr/bin/env sh
# Verify the app-side realtime WebSocket can carry structured navigation progress.

set -eu

port=${PORT:-5188}
log_file=${TMPDIR:-/tmp}/duplex-navigation-progress-smoke.log

npm run build >/dev/null

APP_ID=${APP_ID:-smoke-app} ACCESS_TOKEN=${ACCESS_TOKEN:-smoke-token} PORT="$port" npm start >"$log_file" 2>&1 &
pid=$!
cleanup() {
  kill "$pid" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

ready=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.2
done

if [ "$ready" != "1" ]; then
  echo "navigation progress smoke service did not become ready; log follows" >&2
  cat "$log_file" >&2
  exit 1
fi

PORT="$port" npm run smoke:navigation-progress
