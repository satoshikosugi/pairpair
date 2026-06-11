import { ipcMain } from "electron";
import log from "electron-log";
import { sendToRenderer } from "../window";

export function setupMediaIpc(): void {
  ipcMain.handle(
    "media:applyConstraints",
    (_event, constraints: { width: number; height: number; fps: number; bitrateMbps: number }) => {
      sendToRenderer("media:applyConstraints", constraints);
      log.info(
        { width: constraints.width, height: constraints.height, fps: constraints.fps, bitrateMbps: constraints.bitrateMbps },
        "Media constraints forwarded to renderer",
      );
      return true;
    },
  );
}
