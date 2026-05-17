import { describe, expect, it } from "vitest";
import { getConfigStatus, loadConfig } from "../src/config.js";

describe("config", () => {
  it("maps APP_ID and ACCESS_TOKEN into realtime auth", () => {
    const config = loadConfig({
      APP_ID: "app-id",
      ACCESS_TOKEN: "token"
    });
    const status = getConfigStatus(config);

    expect(status.ok).toBe(true);
    expect(config.realtime.appId).toBe("app-id");
    expect(config.realtime.accessToken).toBe("token");
    expect(config.realtime.resourceId).toBe("volc.speech.dialog");
    expect(config.realtime.inputFormat).toBe("pcm_s16le");
    expect(config.realtime.outputFormat).toBe("pcm_f32le");
  });

  it("lets realtime-specific auth override shared Volcengine aliases", () => {
    const config = loadConfig({
      APP_ID: "app-id",
      ACCESS_TOKEN: "token",
      VOLCENGINE_REALTIME_APP_ID: "rt-app",
      VOLCENGINE_REALTIME_ACCESS_TOKEN: "rt-token"
    });

    expect(config.realtime.appId).toBe("rt-app");
    expect(config.realtime.accessToken).toBe("rt-token");
  });

  it("reports missing realtime credentials", () => {
    const status = getConfigStatus(loadConfig({}));
    expect(status.ok).toBe(false);
    expect(status.missing).toContain("VOLCENGINE_REALTIME_APP_ID or APP_ID");
    expect(status.missing).toContain("VOLCENGINE_REALTIME_ACCESS_TOKEN or ACCESS_TOKEN");
  });
});
