import { afterEach, describe, expect, it } from "vitest";
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
});
