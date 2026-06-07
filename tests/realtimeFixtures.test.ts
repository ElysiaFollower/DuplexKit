import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

type Scenario = {
  id: string;
  text: string;
  audioFile: string;
  expect: {
    assistantIncludesAny?: string[];
    tool?: string;
    noTool?: boolean;
    toolResultTool?: string;
    toolResultIncludes?: string;
  };
};

describe("realtime fixture scenarios", () => {
  const config = JSON.parse(readFileSync(path.join(process.cwd(), "tests/assets/scenarios.json"), "utf8")) as {
    schemaVersion: number;
    audioFormat: { codec: string; sampleRate: number; channels: number };
    scenarios: Scenario[];
  };

  it("documents reusable audio fixture format", () => {
    expect(config.schemaVersion).toBe(1);
    expect(config.audioFormat).toMatchObject({
      codec: "pcm_s16le",
      sampleRate: 24000,
      channels: 1
    });
  });

  it("keeps each scenario independently assertable", () => {
    expect(config.scenarios.length).toBeGreaterThanOrEqual(3);
    for (const scenario of config.scenarios) {
      expect(scenario.id).toMatch(/^[a-z0-9-]+$/);
      expect(scenario.text.length).toBeGreaterThan(0);
      expect(scenario.audioFile).toMatch(/\.wav$/);
      expect(scenario.expect.assistantIncludesAny?.length).toBeGreaterThan(0);
      expect(Boolean(scenario.expect.tool) || Boolean(scenario.expect.toolResultTool) || scenario.expect.noTool).toBe(true);
    }
  });
});
