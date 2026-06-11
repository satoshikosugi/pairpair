import { ipcMain, globalShortcut } from "electron";
import log from "electron-log";
import { sendToRenderer } from "../window";

export function setupSessionIpc(): void {
  ipcMain.handle("session:registerShortcuts", (_event, isHost: boolean) => {
    if (!isHost) return;

    // Register host control shortcuts
    const shortcuts =
      process.platform === "darwin"
        ? {
            pause: "Command+Option+P",
            revoke: "Command+Option+Escape",
            end: "Command+Option+Shift+Q",
          }
        : {
            pause: "Ctrl+Alt+P",
            revoke: "Ctrl+Alt+Escape",
            end: "Ctrl+Alt+Shift+Q",
          };

    try {
      globalShortcut.register(shortcuts.pause, () => {
        log.info("Host pause shortcut triggered");
        sendToRenderer("session:shortcut", "pause");
      });

      globalShortcut.register(shortcuts.revoke, () => {
        log.info("Host revoke shortcut triggered");
        sendToRenderer("session:shortcut", "revoke");
      });

      globalShortcut.register(shortcuts.end, () => {
        log.info("Host end session shortcut triggered");
        sendToRenderer("session:shortcut", "end");
      });
    } catch (err) {
      log.error("Failed to register shortcuts:", err);
    }
  });

  ipcMain.handle("session:unregisterShortcuts", () => {
    globalShortcut.unregisterAll();
  });
}
