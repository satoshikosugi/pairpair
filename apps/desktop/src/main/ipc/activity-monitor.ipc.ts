import { ipcMain, powerMonitor, BrowserWindow } from "electron";
import { getLastRemoteInputAt } from "../native/input-controller";

// Poll interval in ms
const POLL_INTERVAL_MS = 200;

// getSystemIdleTime() returns integer seconds; if below this threshold the user is active
const ACTIVE_THRESHOLD_SECS = 1;
const REMOTE_INPUT_SUPPRESSION_MS = 1500;

let monitorInterval: ReturnType<typeof setInterval> | null = null;

function sendActivity(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("activity:detected");
    }
  }
}

export function setupActivityMonitorIpc(): void {
  ipcMain.handle("activity:start", () => {
    if (monitorInterval) return; // already running
    monitorInterval = setInterval(() => {
      if (Date.now() - getLastRemoteInputAt() < REMOTE_INPUT_SUPPRESSION_MS) {
        return;
      }
      // When system idle time < threshold, the user has been active very recently
      if (powerMonitor.getSystemIdleTime() < ACTIVE_THRESHOLD_SECS) {
        sendActivity();
      }
    }, POLL_INTERVAL_MS);
  });

  ipcMain.handle("activity:stop", () => {
    if (monitorInterval) {
      clearInterval(monitorInterval);
      monitorInterval = null;
    }
  });
}
