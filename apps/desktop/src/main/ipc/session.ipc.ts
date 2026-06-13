import { ipcMain, globalShortcut } from "electron";
import log from "electron-log";
import { getMainWindow, sendToRenderer } from "../window";

export function setupSessionIpc(): void {
  ipcMain.handle("session:registerShortcuts", (_event, isHost: boolean) => {
    if (!isHost) return;

    // Register host control shortcuts
    const shortcuts =
      process.platform === "darwin"
        ? {
            pause: "Command+Control+P",
            revoke: "Command+Control+R",
            end: "Command+Control+Shift+Q",
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

  ipcMain.handle("session:setGuestFullscreen", (_event, fullscreen: boolean) => {
    const win = getMainWindow();
    if (!win) return false;

    win.setAutoHideMenuBar(fullscreen);
    win.setMenuBarVisibility(!fullscreen);
    win.setFullScreen(fullscreen);
    sendToRenderer("session:fullscreen-changed", fullscreen);
    return true;
  });
}
