import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { buildServer } from "../src/server.js";

const apps: Array<ReturnType<typeof buildServer>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("server", () => {
  it("serves health in mock mode", async () => {
    const app = buildServer(loadConfig({ DEMO_MOCK: "1" }));
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json().config.ok).toBe(true);
  });

  it("serves the browser demo page", async () => {
    const app = buildServer(loadConfig({ DEMO_MOCK: "1" }));
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Duplex Voice Demo");
  });

  it("runs a mock turn through the HTTP API", async () => {
    const app = buildServer(loadConfig({ DEMO_MOCK: "1" }));
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/turn",
      payload: {
        sessionId: "test",
        mimeType: "audio/wav",
        audioBase64: Buffer.alloc(64).toString("base64")
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.transcript).toContain("mock");
    expect(body.reply).toContain(body.transcript);
    expect(body.audio.mimeType).toBe("audio/wav");
  });
});
