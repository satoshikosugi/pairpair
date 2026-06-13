import { ipcMain } from "electron";
import log from "electron-log";
import type { InputEvent } from "@pairpair/shared";
import { injectInputEvent } from "../native/input-controller";

export function setupInputIpc(): void {
  ipcMain.handle("input:inject", (_event, inputEvent: InputEvent) => {
    try {
      return injectInputEvent(inputEvent);
    } catch (err) {
      log.error("input:inject error:", err);
      return false;
    }
  });
}
