import { afterEach, describe, expect, it } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { loadConfig } from "../src/config.js";
import { buildServer } from "../src/server.js";

const apps: Array<ReturnType<typeof buildServer>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("server", () => {
  it("serves health for realtime route", async () => {
    const app = buildServer(loadConfig({ APP_ID: "app-id", ACCESS_TOKEN: "token" }));
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json().config.ok).toBe(true);
    expect(response.json().config.realtime.outputFormat).toBe("pcm_f32le");
  });

  it("serves the browser demo page", async () => {
    const app = buildServer(loadConfig({ APP_ID: "app-id", ACCESS_TOKEN: "token" }));
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Duplex Voice Demo");
  });

  it("rejects non-WebSocket realtime HTTP requests", async () => {
    const app = buildServer(loadConfig({ APP_ID: "app-id", ACCESS_TOKEN: "token" }));
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/realtime" });
    expect(response.statusCode).toBe(426);
  });

  it("does not expose legacy cascaded HTTP turn routes", async () => {
    const app = buildServer(loadConfig({ APP_ID: "app-id", ACCESS_TOKEN: "token" }));
    apps.push(app);

    const turn = await app.inject({ method: "POST", url: "/api/turn", payload: {} });
    const textTurn = await app.inject({ method: "POST", url: "/api/text-turn", payload: {} });

    expect(turn.statusCode).toBe(404);
    expect(textTurn.statusCode).toBe(404);
  });

  it("serves and updates runtime prompt settings", async () => {
    const app = buildServer(loadConfig({ APP_ID: "app-id", ACCESS_TOKEN: "token" }));
    apps.push(app);

    const before = await app.inject({ method: "GET", url: "/api/runtime-settings" });
    expect(before.statusCode).toBe(200);
    expect(before.json().settings.systemRole).toContain("中文语音助手");

    const updated = await app.inject({
      method: "PUT",
      url: "/api/runtime-settings",
      payload: { systemRole: "你是测试助手。", speakingStyle: "短句。" }
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().settings.systemRole).toBe("你是测试助手。");
    expect(updated.json().settings.speakingStyle).toBe("短句。");
  });

  it("serves tool registry metadata", async () => {
    const app = buildServer(loadConfig({ APP_ID: "app-id", ACCESS_TOKEN: "token" }));
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/tools" });
    expect(response.statusCode).toBe(200);
    expect(response.json().tools.map((tool: { name: string }) => tool.name)).toContain("map.open");
    expect(response.json().promptTemplates.length).toBeGreaterThan(0);
  });

  it("saves structured session logs inside the repo", async () => {
    const app = buildServer(loadConfig({ APP_ID: "app-id", ACCESS_TOKEN: "token" }));
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/session-logs",
      payload: {
        dialogue: [{ id: "turn-1", at: "2026-05-17T00:00:00.000Z", role: "You", text: "打开地图" }],
        flow: [{ at: "2026-05-17T00:00:01.000Z", kind: "tool", payload: { phase: "started" } }]
      }
    });

    expect(response.statusCode).toBe(201);
    const saved = response.json();
    expect(saved.filename).toMatch(/\.json$/);
    expect(saved.path).toContain("/logs/session/");

    const file = JSON.parse(await readFile(saved.path, "utf8"));
    expect(file.schemaVersion).toBe(1);
    expect(file.payload.dialogue[0].text).toBe("打开地图");
    expect(file.payload.flow[0].payload.phase).toBe("started");

    await rm(saved.path, { force: true });
  });
});
