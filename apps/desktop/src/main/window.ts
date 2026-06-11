import { BrowserWindow } from "electron";

export function getMainWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows()[0];
}

export function sendToRenderer(channel: string, ...args: unknown[]): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args);
  }
}
