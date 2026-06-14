import { app, ipcMain, globalShortcut } from "electron";
import log from "electron-log";
import { getMainWindow, sendToRenderer } from "../window";
import { refreshApplicationMenu, setupApplicationMenu } from "../menu";
import { getCurrentImeMode } from "../native/input-controller";

// ---- macOS ゲスト用 TIS (Text Input Sources) IME ポーリングモニター ----
//
// `TISCopyCurrentKeyboardInputSource()` を 100ms 間隔でポーリングし、
// 入力ソースが変化したら renderer へ "session:ime-mode" IPC を送信する。
//
// これにより以下のすべての IME 切り替え方法を検出できる:
//   - JIS キーボードの 英数 / かな 物理キー
//   - メニューバーの ABC / あ ソフトボタンのクリック
//   - US キーボードの Ctrl+Space
//   - Globe キー (MacBook / Magic Keyboard)
//   - その他あらゆるシステムレベルの入力ソース切り替え

const IME_POLL_INTERVAL_MS = 100;

let imeMonitorTimer: ReturnType<typeof setInterval> | null = null;
let imeMonitorWebContentsId: number | null = null;
let lastImeMode: string | null = null;

function startImeMonitor(webContentsId: number): void {
  stopImeMonitor();
  if (process.platform !== "darwin") return;

  imeMonitorWebContentsId = webContentsId;
  // 初期値を記録（最初のポーリングで誤検知しないよう）
  lastImeMode = getCurrentImeMode();

  imeMonitorTimer = setInterval(() => {
    const mode = getCurrentImeMode();
    if (mode === null || mode === lastImeMode) return;
    lastImeMode = mode;

    // webContents は遅延で破棄される可能性があるため毎回参照を取得する
    const { webContents } = require("electron") as typeof import("electron");
    const wc = webContents.fromId(imeMonitorWebContentsId ?? -1);
    if (!wc || wc.isDestroyed()) {
      stopImeMonitor();
      return;
    }
    log.info(`[IME] Source changed → ${mode}`);
    wc.send("session:ime-mode", { mode });
  }, IME_POLL_INTERVAL_MS);

  log.info(`[IME] Started TIS polling monitor (interval=${IME_POLL_INTERVAL_MS}ms)`);
}

function stopImeMonitor(): void {
  if (imeMonitorTimer !== null) {
    clearInterval(imeMonitorTimer);
    imeMonitorTimer = null;
  }
  imeMonitorWebContentsId = null;
  lastImeMode = null;
  log.info("[IME] Stopped TIS polling monitor");
}

function reactivateMacApplication(forceReshow = false): void {
  if (process.platform !== "darwin") return;

  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;

  const focusWindow = () => {
    if (win.isDestroyed()) return;
    if (!win.isVisible()) {
      win.show();
    }
    app.focus({ steal: true });
    win.moveTop();
    win.focus();
    refreshApplicationMenu();
  };

  if (forceReshow) {
    app.hide();
    setTimeout(() => {
      if (win.isDestroyed()) return;
      app.show();
      focusWindow();
    }, 0);
  }

  focusWindow();
  setTimeout(focusWindow, 0);
  setTimeout(focusWindow, 180);
  setTimeout(focusWindow, 360);
}

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

  ipcMain.handle("session:setRole", (event, role: "host" | "guest" | null) => {
    log.info(`[Menu] session:setRole IPC received: role=${String(role)}, platform=${process.platform}`);
    setupApplicationMenu(role);
    // macOS: ロール設定時に PairPair をアクティブアプリとして再確定させる。
    // 役割切替直後は BrowserWindow.focus() だけでは OS メニューが別アプリのまま残ることがある。
    if (role !== null) {
      reactivateMacApplication(true);
    }
    if (role === "guest" && process.platform === "darwin") {
      startImeMonitor(event.sender.id);
    } else {
      stopImeMonitor();
    }
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
    // macOS: フルスクリーン解除後に PairPair をアクティブアプリとして再確定させる。
    // setFullScreen(false) のアニメーション完了後に他のアプリがアクティブになり、
    // PairPair にフォーカスがあっても別アプリのメニューが表示される問題を防ぐ。
    if (!fullscreen) {
      reactivateMacApplication();
    }
    sendToRenderer("session:fullscreen-changed", actualFullscreen ? fullscreen : win.isFullScreen());
    return actualFullscreen;
  });
}
