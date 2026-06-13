import { ipcMain, globalShortcut } from "electron";
import log from "electron-log";
import { getMainWindow, sendToRenderer } from "../window";
import { setupApplicationMenu } from "../menu";

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

  ipcMain.handle("session:setRole", (_event, role: "host" | "guest" | null) => {
    setupApplicationMenu(role);
    return true;
  });

  ipcMain.handle("session:setGuestFullscreen", async (_event, fullscreen: boolean) => {
    const win = getMainWindow();
    if (!win) return false;

    if (win.isFullScreen() === fullscreen) {
      sendToRenderer("session:fullscreen-changed", fullscreen);
      return true;
    }

    win.setAutoHideMenuBar(fullscreen);
    win.setMenuBarVisibility(!fullscreen);

    const actualFullscreen = await new Promise<boolean>((resolve) => {
      let settled = false;
      const targetEvent = fullscreen ? "enter-full-screen" : "leave-full-screen";
      const oppositeEvent = fullscreen ? "leave-full-screen" : "enter-full-screen";
      const cleanup = () => {
        win.removeListener(targetEvent, handleTarget);
        win.removeListener(oppositeEvent, handleOpposite);
      };
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const handleTarget = () => finish(true);
      const handleOpposite = () => finish(false);

      win.once(targetEvent, handleTarget);
      win.once(oppositeEvent, handleOpposite);
      win.setFullScreen(fullscreen);

      setTimeout(() => {
        finish(win.isFullScreen() === fullscreen);
      }, 1200);
    });
    sendToRenderer("session:fullscreen-changed", actualFullscreen ? fullscreen : win.isFullScreen());
    return actualFullscreen;
  });
}
