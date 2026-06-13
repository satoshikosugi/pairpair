import { screen } from "electron";
import log from "electron-log";
import type { InputEvent } from "@pairpair/shared";
import * as nativeInput from "@pairpair/native-input";
import { DOM_KEY_TO_VK, isNativeInputAvailable } from "@pairpair/native-input";

export interface CaptureArea {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

let currentCaptureArea: CaptureArea | null = null;

export function setCaptureArea(area: CaptureArea): void {
  currentCaptureArea = area;
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
  const x = Math.round(area.x + normalizedX * area.width * area.scaleFactor);
  const y = Math.round(area.y + normalizedY * area.height * area.scaleFactor);
  return { x, y };
}

export function injectInputEvent(event: InputEvent): boolean {
  const area = currentCaptureArea ?? getCaptureAreaFromDisplay();

  if (!isNativeInputAvailable()) {
    log.error("Native input module is unavailable; input injection skipped", { eventType: event.type });
    return false;
  }

  try {
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
        const vkCode = DOM_KEY_TO_VK[event.code];
        if (vkCode !== undefined) {
          nativeInput.keyDown(vkCode);
        } else {
          log.warn(`Unknown key code: ${event.code}`);
        }
        break;
      }
      case "keyboard.up": {
        const vkCode = DOM_KEY_TO_VK[event.code];
        if (vkCode !== undefined) {
          nativeInput.keyUp(vkCode);
        } else {
          log.warn(`Unknown key code: ${event.code}`);
        }
        break;
      }
      case "text.input": {
        nativeInput.typeText(event.text);
        break;
      }
    }
    return true;
  } catch (err) {
    log.error("Input injection error:", err);
    return false;
  }
}
