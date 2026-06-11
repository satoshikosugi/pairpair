import type { BrowserWindow } from "electron";
import log from "electron-log";

export function setupStatsReceiver(win: BrowserWindow): void {
  win.webContents.on("ipc-message", (_event, channel, ...args) => {
    if (channel === "stats:update") {
      const stats = args[0] as Record<string, unknown>;
      log.debug({ stats }, "WebRTC stats update");
    }
  });
}
