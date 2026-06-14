import { describe, expect, it } from "vitest";
import { parseMacInputSourceMode } from "./native/mac-input-source";

describe("parseMacInputSourceMode", () => {
  it("detects Japanese input modes from HIToolbox output", () => {
    const output = `
(
    {
        "Input Mode" = "com.apple.inputmethod.Japanese.RomajiTyping.Japanese";
        "Input Source Kind" = "Input Mode";
    }
)
`;
    expect(parseMacInputSourceMode(output)).toBe("japanese");
  });

  it("detects ABC keyboard layout as latin mode", () => {
    const output = `
(
    {
        InputSourceKind = "Keyboard Layout";
        "KeyboardLayout Name" = ABC;
    }
)
`;
    expect(parseMacInputSourceMode(output)).toBe("latin");
  });
});
