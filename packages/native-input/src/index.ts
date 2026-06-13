// Native input injection module
// On Windows: uses SendInput/SetCursorPos via napi-rs Rust binding
// On macOS: uses CGEvent via napi-rs Rust binding
// This is a stub that will be replaced by actual native bindings

export interface NativeInputModule {
  moveMouse(x: number, y: number): void;
  mouseButton(button: number, down: boolean, x: number, y: number): void;
  mouseScroll(deltaX: number, deltaY: number, x: number, y: number): void;
  keyDown(vkCode: number): void;
  keyUp(vkCode: number): void;
  typeText(text: string): void;
}

declare const require: (id: string) => unknown;
declare const __dirname: string;
declare const process:
  | {
    versions?: { electron?: string };
    arch?: string;
    platform?: string;
    resourcesPath?: string;
  }
  | undefined;

let nativeModule: NativeInputModule | null = null;
let attemptedLoad = false;

function getBinaryName(): string | null {
  if (typeof process === "undefined") return null;
  const { arch, platform } = process;
  if (platform === "win32") {
    if (arch === "x64") return "index.win32-x64-msvc.node";
    if (arch === "ia32") return "index.win32-ia32-msvc.node";
    if (arch === "arm64") return "index.win32-arm64-msvc.node";
  }
  if (platform === "darwin") {
    if (arch === "x64") return "index.darwin-x64.node";
    if (arch === "arm64") return "index.darwin-arm64.node";
  }
  return null;
}

function getCandidatePaths(): string[] {
  const binaryName = getBinaryName();
  if (!binaryName) return [];

  const candidates = [`${__dirname}/../${binaryName}`];

  if (typeof process !== "undefined" && process.versions?.electron && process.resourcesPath) {
    candidates.push(`${process.resourcesPath}/native-input/${binaryName}`);
  }

  return candidates;
}

function loadNativeModule(): NativeInputModule | null {
  const errors: unknown[] = [];

  for (const candidatePath of getCandidatePaths()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const addon = require(candidatePath);
      return addon as NativeInputModule;
    } catch (err) {
      errors.push({ candidatePath, err });
    }
  }

  try {
    // Fallback to the generated package root loader for environments we do not enumerate above.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const addon = require("../index.js");
    return addon as NativeInputModule;
  } catch (rootError) {
    errors.push({ candidatePath: "../index.js", err: rootError });
    for (const entry of errors) {
      console.warn("[native-input] Native addon load failure:", entry);
    }
    console.warn("[native-input] Native addon not available, using stub");
    return null;
  }
}

function getModule(): NativeInputModule {
  if (!attemptedLoad) {
    attemptedLoad = true;
    nativeModule = loadNativeModule();
  }
  if (!nativeModule) {
    // Return stub that logs warnings
    return {
      moveMouse: (x, y) => console.warn(`[native-input] moveMouse(${x}, ${y}) - stub`),
      mouseButton: (button, down, x, y) => console.warn(`[native-input] mouseButton(${button}, ${down}, ${x}, ${y}) - stub`),
      mouseScroll: (deltaX, deltaY, x, y) => console.warn(`[native-input] mouseScroll(${deltaX}, ${deltaY}, ${x}, ${y}) - stub`),
      keyDown: (vkCode) => console.warn(`[native-input] keyDown(${vkCode}) - stub`),
      keyUp: (vkCode) => console.warn(`[native-input] keyUp(${vkCode}) - stub`),
      typeText: (text) => console.warn(`[native-input] typeText(${text}) - stub`),
    };
  }
  return nativeModule;
}

export function isNativeInputAvailable(): boolean {
  if (!attemptedLoad) {
    attemptedLoad = true;
    nativeModule = loadNativeModule();
  }
  return nativeModule !== null;
}

export function moveMouse(x: number, y: number): void {
  getModule().moveMouse(x, y);
}

export function mouseButton(button: number, down: boolean, x: number, y: number): void {
  getModule().mouseButton(button, down, x, y);
}

export function mouseScroll(deltaX: number, deltaY: number, x: number, y: number): void {
  getModule().mouseScroll(deltaX, deltaY, x, y);
}

export function keyDown(vkCode: number): void {
  getModule().keyDown(vkCode);
}

export function keyUp(vkCode: number): void {
  getModule().keyUp(vkCode);
}

export function typeText(text: string): void {
  getModule().typeText(text);
}

// DOM code to Windows virtual-key mapping
export const DOM_KEY_TO_VK: Record<string, number> = {
  "KeyA": 0x41, "KeyB": 0x42, "KeyC": 0x43, "KeyD": 0x44, "KeyE": 0x45,
  "KeyF": 0x46, "KeyG": 0x47, "KeyH": 0x48, "KeyI": 0x49, "KeyJ": 0x4A,
  "KeyK": 0x4B, "KeyL": 0x4C, "KeyM": 0x4D, "KeyN": 0x4E, "KeyO": 0x4F,
  "KeyP": 0x50, "KeyQ": 0x51, "KeyR": 0x52, "KeyS": 0x53, "KeyT": 0x54,
  "KeyU": 0x55, "KeyV": 0x56, "KeyW": 0x57, "KeyX": 0x58, "KeyY": 0x59,
  "KeyZ": 0x5A,
  "Digit0": 0x30, "Digit1": 0x31, "Digit2": 0x32, "Digit3": 0x33, "Digit4": 0x34,
  "Digit5": 0x35, "Digit6": 0x36, "Digit7": 0x37, "Digit8": 0x38, "Digit9": 0x39,
  "F1": 0x70, "F2": 0x71, "F3": 0x72, "F4": 0x73, "F5": 0x74,
  "F6": 0x75, "F7": 0x76, "F8": 0x77, "F9": 0x78, "F10": 0x79,
  "F11": 0x7A, "F12": 0x7B,
  "Enter": 0x0D, "Space": 0x20, "Backspace": 0x08, "Tab": 0x09,
  "Escape": 0x1B, "Delete": 0x2E, "Insert": 0x2D,
  "Home": 0x24, "End": 0x23, "PageUp": 0x21, "PageDown": 0x22,
  "ArrowLeft": 0x25, "ArrowUp": 0x26, "ArrowRight": 0x27, "ArrowDown": 0x28,
  "ControlLeft": 0x11, "ControlRight": 0x11,
  "ShiftLeft": 0x10, "ShiftRight": 0x10,
  "AltLeft": 0x12, "AltRight": 0x12,
  "MetaLeft": 0x5B, "MetaRight": 0x5C,
  "Convert": 0x1C, "NonConvert": 0x1D, "KanaMode": 0x15, "KanjiMode": 0x19,
  "Lang1": 0x15, "Lang2": 0xF0,
  "CapsLock": 0x14, "NumLock": 0x90, "ScrollLock": 0x91,
  "Semicolon": 0xBA, "Equal": 0xBB, "Comma": 0xBC, "Minus": 0xBD,
  "Period": 0xBE, "Slash": 0xBF, "Backquote": 0xC0,
  "IntlYen": 0xDC, "IntlRo": 0xE2, "IntlBackslash": 0xE2,
  "BracketLeft": 0xDB, "Backslash": 0xDC, "BracketRight": 0xDD, "Quote": 0xDE,
};

// DOM code to macOS virtual-key mapping
export const DOM_KEY_TO_MAC_KEYCODE: Record<string, number> = {
  "KeyA": 0x00, "KeyS": 0x01, "KeyD": 0x02, "KeyF": 0x03, "KeyH": 0x04,
  "KeyG": 0x05, "KeyZ": 0x06, "KeyX": 0x07, "KeyC": 0x08, "KeyV": 0x09,
  "KeyB": 0x0B, "KeyQ": 0x0C, "KeyW": 0x0D, "KeyE": 0x0E, "KeyR": 0x0F,
  "KeyY": 0x10, "KeyT": 0x11, "Digit1": 0x12, "Digit2": 0x13, "Digit3": 0x14,
  "Digit4": 0x15, "Digit6": 0x16, "Digit5": 0x17, "Equal": 0x18, "Digit9": 0x19,
  "Digit7": 0x1A, "Minus": 0x1B, "Digit8": 0x1C, "Digit0": 0x1D, "BracketRight": 0x1E,
  "KeyO": 0x1F, "KeyU": 0x20, "BracketLeft": 0x21, "KeyI": 0x22, "KeyP": 0x23,
  "Enter": 0x24, "KeyL": 0x25, "KeyJ": 0x26, "Quote": 0x27, "KeyK": 0x28,
  "Semicolon": 0x29, "Backslash": 0x2A, "Comma": 0x2B, "Slash": 0x2C, "KeyN": 0x2D,
  "KeyM": 0x2E, "Period": 0x2F, "Tab": 0x30, "Space": 0x31, "Backquote": 0x32,
  "Backspace": 0x33, "Escape": 0x35,
  "MetaLeft": 0x37, "ShiftLeft": 0x38, "CapsLock": 0x39, "AltLeft": 0x3A, "ControlLeft": 0x3B,
  "ShiftRight": 0x3C, "AltRight": 0x3D, "ControlRight": 0x3E, "MetaRight": 0x36,
  "F1": 0x7A, "F2": 0x78, "F3": 0x63, "F4": 0x76, "F5": 0x60, "F6": 0x61,
  "F7": 0x62, "F8": 0x64, "F9": 0x65, "F10": 0x6D, "F11": 0x67, "F12": 0x6F,
  "Home": 0x73, "PageUp": 0x74, "Delete": 0x75, "End": 0x77, "PageDown": 0x79,
  "ArrowLeft": 0x7B, "ArrowRight": 0x7C, "ArrowDown": 0x7D, "ArrowUp": 0x7E,
  "Lang1": 0x68, "Lang2": 0x66, "KanaMode": 0x68,
  "IntlYen": 0x5D, "IntlRo": 0x5E,
};
