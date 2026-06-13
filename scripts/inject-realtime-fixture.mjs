#!/usr/bin/env node
const fixture = process.argv[2];
const port = process.env.PORT || "5177";

if (!fixture) {
  console.error("Usage: npm run debug:realtime-fixture -- <open-map|navigate-beijing-south|smalltalk-no-tool|cancel-no-running-tool>");
  process.exit(1);
}

const response = await fetch(`http://127.0.0.1:${port}/api/debug/realtime-fixture`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ fixture })
});

const body = await response.text();
if (!response.ok) {
  console.error(body);
  process.exit(1);
}

console.log(body);
