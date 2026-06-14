import { describe, expect, it } from "vitest";
import { getImeModeEvent } from "./SessionPage";

describe("getImeModeEvent", () => {
  it("treats Mac Japanese keyboard aliases as direct mode switches", () => {
    expect(getImeModeEvent({ code: "", key: "英数", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }))
      .toEqual({ type: "ime.mode", mode: "latin" });
    expect(getImeModeEvent({ code: "", key: "かな", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }))
      .toEqual({ type: "ime.mode", mode: "japanese" });
  });

  it("treats Mac English keyboard Ctrl+Space as an IME toggle", () => {
    expect(getImeModeEvent({ code: "Space", key: " ", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }))
      .toEqual({ type: "ime.mode", mode: "toggle" });
  });

  it("does not hijack plain Space", () => {
    expect(getImeModeEvent({ code: "Space", key: " ", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }))
      .toBeNull();
  });
});
