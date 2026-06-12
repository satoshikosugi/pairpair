import { ipcMain, powerMonitor, BrowserWindow } from "electron";

// Poll interval in ms
const POLL_INTERVAL_MS = 200;

// getSystemIdleTime() returns integer seconds; if below this threshold the user is active
const ACTIVE_THRESHOLD_SECS = 1;

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
