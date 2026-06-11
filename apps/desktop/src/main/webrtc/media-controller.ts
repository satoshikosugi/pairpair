import type { BrowserWindow } from "electron";
import log from "electron-log";

export interface MediaConstraints {
  width: number;
  height: number;
  fps: number;
  bitrateMbps: number;
}

export function sendMediaConstraints(win: BrowserWindow, constraints: MediaConstraints): void {
  if (!win.isDestroyed()) {
    win.webContents.send("media:applyConstraints", constraints);
    log.info({ width: constraints.width, height: constraints.height, fps: constraints.fps, bitrateMbps: constraints.bitrateMbps }, "Sent media constraints to renderer");
  }
}
