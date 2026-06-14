import { existsSync } from "node:fs";
import path from "node:path";
import { screen, BrowserWindow } from "electron";
import log from "electron-log";
import type { InputEvent } from "@pairpair/shared";
import { DOM_KEY_TO_MAC_KEYCODE, DOM_KEY_TO_VK } from "@pairpair/native-input";
import { getMainWindow } from "../window";

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

function getNativeModuleCandidates(): string[] {
  const binaryName = getNativeBinaryName();
  if (!binaryName) return [];

  const candidates = new Set<string>();

  try {
    const packageEntry = require.resolve("@pairpair/native-input");
    const packageRoot = path.dirname(path.dirname(packageEntry));
    candidates.add(path.join(packageRoot, binaryName));
  } catch (err) {
    nativeInputLoadError = `Failed to resolve @pairpair/native-input: ${String(err)}`;
  }

  candidates.add(path.join(process.cwd(), "node_modules", "@pairpair", "native-input", binaryName));
  candidates.add(path.join(process.cwd(), "..", "..", "packages", "native-input", binaryName));

  if (process.resourcesPath) {
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
  
  // Windows では注入前にホストウィンドウをフォーカスする必要がある
  if (process.platform === "win32") {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      log.info(`[IME] Windows: focusing main window before IME injection`);
      mainWindow.focus();
      // フォーカスが完全に適用されるまで短い遅延を入れる
      // このブロッキングは IME キーが正しいウィンドウに到達するために重要
    }
  }
  
  if (process.platform === "darwin") {
    if (mode === "japanese") {
      log.info("[IME] macOS: injecting Lang1 (Japanese)");
      tapKey(nativeInput, DOM_KEY_TO_MAC_KEYCODE.Lang1);
    } else if (mode === "latin") {
      log.info("[IME] macOS: injecting Lang2 (Latin)");
      tapKey(nativeInput, DOM_KEY_TO_MAC_KEYCODE.Lang2);
    } else {
      log.info("[IME] macOS: injecting Cmd+Space (toggle)");
      nativeInput.keyDown(DOM_KEY_TO_MAC_KEYCODE.MetaLeft);
      tapKey(nativeInput, DOM_KEY_TO_MAC_KEYCODE.Space);
      nativeInput.keyUp(DOM_KEY_TO_MAC_KEYCODE.MetaLeft);
    }
    return;
  }

  if (process.platform === "win32") {
    const keyCode = mode === "japanese"
      ? DOM_KEY_TO_VK.KanaMode
      : mode === "latin"
        ? DOM_KEY_TO_VK.NonConvert
        : DOM_KEY_TO_VK.KanjiMode;
    log.info(`[IME] Windows: injecting mode=${mode}, keyCode=0x${keyCode.toString(16)}`);
    tapKey(nativeInput, keyCode);
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
