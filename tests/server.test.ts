import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config.js";
import { appendRealtimeTraceLog } from "../src/realtimeTraceLogs.js";
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
    expect(response.body).toContain("DuplexKit");
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
    expect(before.json().settings.systemRole).toContain("金工小子");
    expect(before.json().settings.systemRole).toContain("中文语音导航助手");
    expect(before.json().settings.speaker).toBe("zh_female_vv_jupiter_bigtts");
    expect(before.json().speakerPresets.map((preset: { id: string }) => preset.id)).toEqual([
      "zh_female_vv_jupiter_bigtts",
      "zh_female_xiaohe_jupiter_bigtts",
      "zh_male_yunzhou_jupiter_bigtts",
      "zh_male_xiaotian_jupiter_bigtts"
    ]);

    const updated = await app.inject({
      method: "PUT",
      url: "/api/runtime-settings",
      payload: { systemRole: "你是测试助手。", speakingStyle: "短句。", speaker: "zh_male_yunzhou_jupiter_bigtts" }
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().settings.systemRole).toBe("你是测试助手。");
    expect(updated.json().settings.speakingStyle).toBe("短句。");
    expect(updated.json().settings.speaker).toBe("zh_male_yunzhou_jupiter_bigtts");
  });

  it("uses configured realtime speaker as runtime default", async () => {
    const app = buildServer(
      loadConfig({
        APP_ID: "app-id",
        ACCESS_TOKEN: "token",
        VOLCENGINE_REALTIME_SPEAKER: "zh_male_xiaotian_jupiter_bigtts"
      })
    );
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/runtime-settings" });

    expect(response.statusCode).toBe(200);
    expect(response.json().settings.speaker).toBe("zh_male_xiaotian_jupiter_bigtts");
  });

  it("serves tool registry metadata", async () => {
    const app = buildServer(loadConfig({ APP_ID: "app-id", ACCESS_TOKEN: "token" }));
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/tools" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "map.open",
      "map.close",
      "map.set_origin",
      "map.set_destination",
      "navigation.start",
      "navigation.next",
      "navigation.previous",
      "navigation.status"
    ]);
    expect(response.json().promptTemplates.length).toBeGreaterThan(0);
    expect(body.realtimeProtocol.appToolNames).toEqual([
      "map.open",
      "map.close",
      "map.set_origin",
      "map.set_destination",
      "navigation.start",
      "navigation.next",
      "navigation.previous",
      "navigation.status"
    ]);
    expect(body.realtimeProtocol.internalControlToolNames).toEqual(["control.kill"]);
    expect(body.realtimeProtocol.textBoundaries.messageEndType).toBe("message_end");
    expect(body.realtimeProtocol.clientMessages[0].type).toBe("tool_result");
    expect(body.realtimeProtocol.clientMessages[0].description).toContain("ChatTTSText");
    expect(body.realtimeProtocol.clientMessages[0].description).toContain("默认不把这段注入产生的文本和音频转发给前端");
    expect(body.realtimeProtocol.clientMessages.map((message: { type: string }) => message.type)).toContain("navigation_progress");
    expect(body.realtimeProtocol.serverMessages.map((message: { type: string }) => message.type)).toContain("message_end");
  });

  it("serves Jingong room catalog metadata for frontend and device diagnostics", async () => {
    const app = buildServer(loadConfig({ APP_ID: "app-id", ACCESS_TOKEN: "token" }));
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/jingong-rooms" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.rooms.length).toBeGreaterThanOrEqual(53);
    expect(body.rooms.map((room: { id: string }) => room.id)).toContain("108-2F03");
    expect(body.rooms.map((room: { id: string }) => room.id)).toContain("202-5");
    expect(body.accessRules.join(" ")).toContain("公共楼梯");
    expect(body.knowledgeText).toContain("不能直接到达104、106、108的独立二层");
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

  it("writes realtime trace logs as session-scoped JSONL", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "duplexkit-trace-"));
    const file = await appendRealtimeTraceLog(
      {
        sessionId: "session-1",
        at: "2026-06-13T05:00:00.000Z",
        direction: "internal",
        event: "planner.decision",
        payload: {
          assistantResponse: "我来调用地图工具：设置终点为西门。",
          decision: { action: "tool_call", tool: "map.set_destination", args: { place: "西门" } }
        }
      },
      root
    );

    const lines = (await readFile(file, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      sessionId: "session-1",
      direction: "internal",
      event: "planner.decision",
      payload: {
        decision: {
          tool: "map.set_destination",
          args: { place: "西门" }
        }
      }
    });

    await rm(root, { recursive: true, force: true });
  });
});
