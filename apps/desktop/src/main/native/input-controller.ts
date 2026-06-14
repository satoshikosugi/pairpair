import { existsSync } from "node:fs";
import path from "node:path";
import { screen } from "electron";
import log from "electron-log";
import type { InputEvent } from "@pairpair/shared";

const DOM_KEY_TO_VK: Record<string, number> = {
  KeyA: 0x41, KeyB: 0x42, KeyC: 0x43, KeyD: 0x44, KeyE: 0x45,
  KeyF: 0x46, KeyG: 0x47, KeyH: 0x48, KeyI: 0x49, KeyJ: 0x4A,
  KeyK: 0x4B, KeyL: 0x4C, KeyM: 0x4D, KeyN: 0x4E, KeyO: 0x4F,
  KeyP: 0x50, KeyQ: 0x51, KeyR: 0x52, KeyS: 0x53, KeyT: 0x54,
  KeyU: 0x55, KeyV: 0x56, KeyW: 0x57, KeyX: 0x58, KeyY: 0x59,
  KeyZ: 0x5A,
  Digit0: 0x30, Digit1: 0x31, Digit2: 0x32, Digit3: 0x33, Digit4: 0x34,
  Digit5: 0x35, Digit6: 0x36, Digit7: 0x37, Digit8: 0x38, Digit9: 0x39,
  F1: 0x70, F2: 0x71, F3: 0x72, F4: 0x73, F5: 0x74,
  F6: 0x75, F7: 0x76, F8: 0x77, F9: 0x78, F10: 0x79,
  F11: 0x7A, F12: 0x7B,
  Enter: 0x0D, Space: 0x20, Backspace: 0x08, Tab: 0x09,
  Escape: 0x1B, Delete: 0x2E, Insert: 0x2D,
  Home: 0x24, End: 0x23, PageUp: 0x21, PageDown: 0x22,
  ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27, ArrowDown: 0x28,
  ControlLeft: 0x11, ControlRight: 0x11,
  ShiftLeft: 0x10, ShiftRight: 0x10,
  AltLeft: 0x12, AltRight: 0x12,
  MetaLeft: 0x5B, MetaRight: 0x5C,
  Convert: 0x1C, NonConvert: 0x1D, KanaMode: 0x15, KanjiMode: 0x19,
  Lang1: 0x15, Lang2: 0xF0,
  CapsLock: 0x14, NumLock: 0x90, ScrollLock: 0x91,
  Semicolon: 0xBA, Equal: 0xBB, Comma: 0xBC, Minus: 0xBD,
  Period: 0xBE, Slash: 0xBF, Backquote: 0xC0,
  IntlYen: 0xDC, IntlRo: 0xE2, IntlBackslash: 0xE2,
  BracketLeft: 0xDB, Backslash: 0xDC, BracketRight: 0xDD, Quote: 0xDE,
};

const DOM_KEY_TO_MAC_KEYCODE: Record<string, number> = {
  KeyA: 0x00, KeyS: 0x01, KeyD: 0x02, KeyF: 0x03, KeyH: 0x04,
  KeyG: 0x05, KeyZ: 0x06, KeyX: 0x07, KeyC: 0x08, KeyV: 0x09,
  KeyB: 0x0B, KeyQ: 0x0C, KeyW: 0x0D, KeyE: 0x0E, KeyR: 0x0F,
  KeyY: 0x10, KeyT: 0x11, Digit1: 0x12, Digit2: 0x13, Digit3: 0x14,
  Digit4: 0x15, Digit6: 0x16, Digit5: 0x17, Equal: 0x18, Digit9: 0x19,
  Digit7: 0x1A, Minus: 0x1B, Digit8: 0x1C, Digit0: 0x1D, BracketRight: 0x1E,
  KeyO: 0x1F, KeyU: 0x20, BracketLeft: 0x21, KeyI: 0x22, KeyP: 0x23,
  Enter: 0x24, KeyL: 0x25, KeyJ: 0x26, Quote: 0x27, KeyK: 0x28,
  Semicolon: 0x29, Backslash: 0x2A, Comma: 0x2B, Slash: 0x2C, KeyN: 0x2D,
  KeyM: 0x2E, Period: 0x2F, Tab: 0x30, Space: 0x31, Backquote: 0x32,
  Backspace: 0x33, Escape: 0x35,
  MetaLeft: 0x37, ShiftLeft: 0x38, CapsLock: 0x39, AltLeft: 0x3A, ControlLeft: 0x3B,
  ShiftRight: 0x3C, AltRight: 0x3D, ControlRight: 0x3E, MetaRight: 0x36,
  F1: 0x7A, F2: 0x78, F3: 0x63, F4: 0x76, F5: 0x60, F6: 0x61,
  F7: 0x62, F8: 0x64, F9: 0x65, F10: 0x6D, F11: 0x67, F12: 0x6F,
  Home: 0x73, PageUp: 0x74, Delete: 0x75, End: 0x77, PageDown: 0x79,
  ArrowLeft: 0x7B, ArrowRight: 0x7C, ArrowDown: 0x7D, ArrowUp: 0x7E,
  Lang1: 0x68, Lang2: 0x66, KanaMode: 0x68,
  IntlYen: 0x5D, IntlRo: 0x5E,
};

export interface CaptureArea {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

let currentCaptureArea: CaptureArea | null = null;
let lastRemoteInputAt = 0;
let nativeInputModule: NativeInputModule | null = null;
let nativeInputLoadAttempted = false;
let nativeInputLoadError: string | null = null;
let targetWindowId: string | null = null;

interface NativeInputModule {
  moveMouse(x: number, y: number): void;
  mouseButton(button: number, down: boolean, x: number, y: number): void;
  mouseScroll(deltaX: number, deltaY: number, x: number, y: number): void;
  keyDown(vkCode: number): void;
  keyUp(vkCode: number): void;
  typeText(text: string): void;
  focusWindow?(windowId: string): void;
  /** macOS のみ: TIS API で現在の IME 入力ソースを取得する */
  getCurrentImeMode?(): string;
  /** Windows のみ: IMM32 API で IME の ON/OFF を直接制御する */
  setImeMode?(open: boolean): void;
  /** Windows のみ: 指定ウィンドウの IME ON/OFF を直接制御する */
  setImeModeForWindow?(windowId: string, open: boolean): void;
}

function getNativeBinaryName(): string | null {
  if (process.platform === "win32") {
    if (process.arch === "x64") return "index.win32-x64-msvc.node";
    if (process.arch === "ia32") return "index.win32-ia32-msvc.node";
    if (process.arch === "arm64") return "index.win32-arm64-msvc.node";
  }

  if (process.platform === "darwin") {
    if (process.arch === "x64") return "index.darwin-x64.node";
    if (process.arch === "arm64") return "index.darwin-arm64.node";
  }

  return null;
}

function getNativeBinaryOverrides(binaryName: string): string[] {
  if (!binaryName.endsWith(".node")) return [];
  return [
    binaryName.replace(/\.node$/, ".local.node"),
    binaryName.replace(/\.node$/, ".override.node"),
  ];
}

function getNativeModuleCandidates(): string[] {
  const binaryName = getNativeBinaryName();
  if (!binaryName) return [];
  const overrideNames = getNativeBinaryOverrides(binaryName);

  const candidates = new Set<string>();

  try {
    const packageEntry = require.resolve("@pairpair/native-input");
    const packageRoot = path.dirname(packageEntry);
    for (const overrideName of overrideNames) {
      candidates.add(path.join(packageRoot, overrideName));
    }
    candidates.add(path.join(packageRoot, binaryName));
  } catch (err) {
    nativeInputLoadError = `Failed to resolve @pairpair/native-input: ${String(err)}`;
  }

  for (const overrideName of overrideNames) {
    candidates.add(path.join(process.cwd(), "node_modules", "@pairpair", "native-input", overrideName));
    candidates.add(path.join(process.cwd(), "..", "..", "packages", "native-input", overrideName));
  }
  candidates.add(path.join(process.cwd(), "node_modules", "@pairpair", "native-input", binaryName));
  candidates.add(path.join(process.cwd(), "..", "..", "packages", "native-input", binaryName));

  if (process.resourcesPath) {
    for (const overrideName of overrideNames) {
      candidates.add(path.join(process.resourcesPath, "native-input", overrideName));
    }
    candidates.add(path.join(process.resourcesPath, "native-input", binaryName));
  }

  return [...candidates];
}

function getNativeInputModule(): NativeInputModule | null {
  if (nativeInputLoadAttempted) return nativeInputModule;
  nativeInputLoadAttempted = true;

  const candidates = getNativeModuleCandidates();
  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      nativeInputModule = require(candidate) as NativeInputModule;
      log.info({ candidate }, "Native input module loaded");
      nativeInputLoadError = null;
      return nativeInputModule;
    } catch (err) {
      nativeInputLoadError = `Failed to require ${candidate}: ${err instanceof Error ? err.stack ?? err.message : String(err)}`;
      log.error({ candidate, err }, "Failed to load native input candidate");
    }
  }

  if (!nativeInputLoadError) {
    nativeInputLoadError = `No native input binary found. candidates=${candidates.join(", ")}`;
  }
  log.error(nativeInputLoadError);
  return null;
}

export function setCaptureArea(area: CaptureArea): void {
  currentCaptureArea = area;
}

export function setTargetWindowId(windowId: string | null): void {
  targetWindowId = windowId;
}

export function getLastRemoteInputAt(): number {
  return lastRemoteInputAt;
}

/**
 * macOS TIS API で現在の IME 入力ソースを取得する。
 * "japanese" または "latin" を返す。
 * macOS 以外 またはネイティブモジュール未ロード時は null を返す。
 */
export function getCurrentImeMode(): string | null {
  if (process.platform !== "darwin") return null;
  const nativeInput = getNativeInputModule();
  if (!nativeInput) return null;
  return nativeInput.getCurrentImeMode?.() ?? null;
}

export function getCaptureAreaFromDisplay(displayId?: string): CaptureArea {
  const displays = screen.getAllDisplays();
  let display = displays[0];

  if (displayId) {
    const found = displays.find((d) => String(d.id) === displayId);
    if (found) display = found;
  }

  return {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    scaleFactor: display.scaleFactor,
  };
}

function normalizedToScreen(normalizedX: number, normalizedY: number, area: CaptureArea): { x: number; y: number } {
  const coordinateScale = process.platform === "win32" ? area.scaleFactor : 1;
  const x = Math.round(area.x + normalizedX * area.width * coordinateScale);
  const y = Math.round(area.y + normalizedY * area.height * coordinateScale);
  return { x, y };
}

function getPlatformKeyCode(code: string): number | undefined {
  if (process.platform === "darwin") {
    return DOM_KEY_TO_MAC_KEYCODE[code];
  }

  return DOM_KEY_TO_VK[code];
}

function tapKey(nativeInput: NativeInputModule, keyCode: number): void {
  log.info(`[IME_DEBUG] tapKey: keyDown(${keyCode})`);
  nativeInput.keyDown(keyCode);
  log.info(`[IME_DEBUG] tapKey: keyUp(${keyCode})`);
  nativeInput.keyUp(keyCode);
  log.info(`[IME_DEBUG] tapKey: completed for keyCode=${keyCode}`);
}

function setImeMode(nativeInput: NativeInputModule, mode: "toggle" | "japanese" | "latin"): void {
  log.info(`[IME] setImeMode called: mode=${mode}, platform=${process.platform}`);

  if (process.platform === "darwin") {
    if (mode === "japanese") {
      log.info("[IME] macOS: injecting Lang1 (Japanese)");
      tapKey(nativeInput, DOM_KEY_TO_MAC_KEYCODE.Lang1);
    } else if (mode === "latin") {
      log.info("[IME] macOS: injecting Lang2 (Latin)");
      tapKey(nativeInput, DOM_KEY_TO_MAC_KEYCODE.Lang2);
    } else {
      // Ctrl+Space = macOS の入力ソース切り替えショートカット
      // Cmd+Space は Spotlight が起動してしまうため絶対に使用しない
      log.info("[IME] macOS: injecting Ctrl+Space (toggle)");
      nativeInput.keyDown(DOM_KEY_TO_MAC_KEYCODE.ControlLeft);
      tapKey(nativeInput, DOM_KEY_TO_MAC_KEYCODE.Space);
      nativeInput.keyUp(DOM_KEY_TO_MAC_KEYCODE.ControlLeft);
    }
    return;
  }

  if (process.platform === "win32") {
    // IMM32 API (ImmSetOpenStatus) が使えれば最も確実
    if (targetWindowId && nativeInput.setImeModeForWindow) {
      const open = mode === "japanese" || mode === "toggle";
      log.info(`[IME] Windows: calling setImeModeForWindow(windowId=${targetWindowId}, open=${open}) via IMM32`);
      nativeInput.setImeModeForWindow(targetWindowId, open);
      return;
    }
    if (!targetWindowId) {
      log.warn("[IME] Windows: targetWindowId is null, falling back to foreground-window IME control");
    } else if (!nativeInput.setImeModeForWindow) {
      log.warn("[IME] Windows: setImeModeForWindow is unavailable, falling back to foreground-window IME control");
    }
    if (nativeInput.setImeMode) {
      const open = mode === "japanese" || mode === "toggle";
      log.info(`[IME] Windows: calling setImeMode(open=${open}) via IMM32`);
      nativeInput.setImeMode(open);
      return;
    }
    const fallbackKeyCode = mode === "japanese"
      ? DOM_KEY_TO_VK.KanaMode
      : mode === "latin"
        ? DOM_KEY_TO_VK.NonConvert
        : DOM_KEY_TO_VK.KanjiMode;
    log.info(`[IME] Windows: setImeMode not available, fallback keyCode=${fallbackKeyCode} for mode=${mode}`);
    tapKey(nativeInput, fallbackKeyCode);
  }
}

export function injectInputEvent(event: InputEvent): boolean {
  const area = currentCaptureArea ?? getCaptureAreaFromDisplay();
  const nativeInput = getNativeInputModule();

  if (!nativeInput) {
    log.error("Native input module is unavailable; input injection skipped", {
      eventType: event.type,
      loadError: nativeInputLoadError,
    });
    return false;
  }

  try {
    lastRemoteInputAt = Date.now();
    if (process.platform === "win32" && targetWindowId && event.type !== "mouse.move") {
      nativeInput.focusWindow?.(targetWindowId);
    }
    switch (event.type) {
      case "mouse.move": {
        const { x, y } = normalizedToScreen(event.x, event.y, area);
        nativeInput.moveMouse(x, y);
        break;
      }
      case "mouse.down": {
        const { x, y } = normalizedToScreen(event.x, event.y, area);
        const btn = event.button === "left" ? 0 : event.button === "right" ? 1 : 2;
        nativeInput.mouseButton(btn, true, x, y);
        break;
      }
      case "mouse.up": {
        const { x, y } = normalizedToScreen(event.x, event.y, area);
        const btn = event.button === "left" ? 0 : event.button === "right" ? 1 : 2;
        nativeInput.mouseButton(btn, false, x, y);
        break;
      }
      case "mouse.wheel": {
        const { x, y } = normalizedToScreen(event.x, event.y, area);
        nativeInput.mouseScroll(event.deltaX, event.deltaY, x, y);
        break;
      }
      case "keyboard.down": {
        const keyCode = getPlatformKeyCode(event.code);
        if (keyCode !== undefined) {
          nativeInput.keyDown(keyCode);
        } else {
          log.warn(`Unknown key code for ${process.platform}: ${event.code}`);
        }
        break;
      }
      case "keyboard.up": {
        const keyCode = getPlatformKeyCode(event.code);
        if (keyCode !== undefined) {
          nativeInput.keyUp(keyCode);
        } else {
          log.warn(`Unknown key code for ${process.platform}: ${event.code}`);
        }
        break;
      }
      case "text.input": {
        nativeInput.typeText(event.text);
        break;
      }
      case "ime.mode": {
        log.info(`[IME] Input injection: ime.mode event received, mode=${event.mode}`);
        setImeMode(nativeInput, event.mode);
        log.info(`[IME] Input injection: ime.mode handled successfully`);
        break;
      }
    }
    return true;
  } catch (err) {
    log.error("Input injection error:", err);
    return false;
  }
}
