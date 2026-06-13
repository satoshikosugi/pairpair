import { app, BrowserWindow, desktopCapturer, globalShortcut, session } from "electron";
import path from "path";
import { setupIpcHandlers } from "./ipc";
import { getSelectedSourceId } from "./ipc/screen.ipc";
import log from "electron-log";
import { setupApplicationMenu } from "./menu";
import { setMainWindow } from "./window";

// Hardware encoding flags (must be set before app.ready)
app.commandLine.appendSwitch("enable-accelerated-video-encode");
app.commandLine.appendSwitch("enable-gpu-rasterization");
if (process.platform === "win32") {
  app.commandLine.appendSwitch("enable-features", "MediaFoundationVideoCapture");
}

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    titleBarStyle: "default",
    show: false,
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  setMainWindow(win);

  win.on("enter-full-screen", () => {
    win.webContents.send("session:fullscreen-changed", true);
  });

  win.on("leave-full-screen", () => {
    win.webContents.send("session:fullscreen-changed", false);
  });

  win.on("closed", () => {
    setMainWindow(null);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
    if (process.env.PAIRPAIR_OPEN_DEVTOOLS === "1") {
      win.webContents.openDevTools();
    }
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return win;
}

app.whenReady().then(() => {
  log.info("App ready");

  // Setup display media request handler for screen capture
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ["screen", "window"] })
      .then((sources) => {
        const sourceId = getSelectedSourceId();
        const selected = sourceId
          ? (sources.find((s) => s.id === sourceId) ?? sources[0])
          : sources[0];
        log.info({ sourceId, selectedName: selected?.name }, "Display media request handled");
        callback({ video: selected });
      })
      .catch((err) => {
        log.error("desktopCapturer.getSources error:", err);
        callback({});
      });
  });

  // Setup IPC handlers
  setupIpcHandlers();
  setupApplicationMenu();

  mainWindow = createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  log.info("App quit");
});

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
