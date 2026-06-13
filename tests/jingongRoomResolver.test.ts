import { describe, expect, it } from "vitest";
import { resolveRoomId, roomLabel } from "../apps/jingongxiaozi/src/duplexkit/roomResolver.js";

describe("jingongxiaozi room resolver", () => {
  it("prefers a specific room number and name over generic classroom matches", () => {
    const roomId = resolveRoomId("208多媒体教室");

    expect(roomId).toBe("208");
    expect(roomLabel(roomId)).toBe("208 多媒体教室");
  });

  it("resolves a plain room number used by navigation commands", () => {
    const roomId = resolveRoomId("114教室");

    expect(roomId).toBe("114");
    expect(roomLabel(roomId)).toBe("114 空房间");
  });

  it("prefers exact long room ids over shorter parent room prefixes", () => {
    expect(resolveRoomId("108-2F03教室")).toBe("108-2F03");
    expect(resolveRoomId("1082F03教室")).toBe("108-2F03");
    expect(roomLabel(resolveRoomId("1082F03教室"))).toBe("108-2F03 多媒体教室");
  });
});
