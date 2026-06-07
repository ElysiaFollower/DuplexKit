#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const assetsDir = path.join(root, "tests", "assets");
const scenariosPath = path.join(assetsDir, "scenarios.json");
const voice = process.env.AUDIO_FIXTURE_VOICE || "Tingting";
const scenarios = JSON.parse(readFileSync(scenariosPath, "utf8")).scenarios || [];

mkdirSync(assetsDir, { recursive: true });

for (const scenario of scenarios) {
  const wavPath = path.join(assetsDir, scenario.audioFile);
  const aiffPath = wavPath.replace(/\.wav$/i, ".aiff");
  synthesize(scenario.text, aiffPath);
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@24000", aiffPath, wavPath], { stdio: "inherit" });
  rmSync(aiffPath, { force: true });
  console.log(`${scenario.id}: ${scenario.text} -> ${path.relative(root, wavPath)}`);
}

function synthesize(text, output) {
  try {
    execFileSync("say", ["-v", voice, "-o", output, text], { stdio: "inherit" });
  } catch (error) {
    console.warn(`say voice "${voice}" failed; retrying with system default voice`);
    execFileSync("say", ["-o", output, text], { stdio: "inherit" });
  }
}
