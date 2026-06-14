import { describe, expect, it } from "vitest";
import { DOM_KEY_TO_MAC_KEYCODE, DOM_KEY_TO_VK } from "@pairpair/native-input";

describe("@pairpair/native-input package exports", () => {
  it("exposes the Windows DOM key mapping at runtime", () => {
    expect(DOM_KEY_TO_VK.KeyA).toBe(0x41);
    expect(DOM_KEY_TO_VK.Enter).toBe(0x0D);
  });

  it("exposes the macOS DOM key mapping at runtime", () => {
    expect(DOM_KEY_TO_MAC_KEYCODE.KeyA).toBe(0x00);
    expect(DOM_KEY_TO_MAC_KEYCODE.Enter).toBe(0x24);
  });
});
