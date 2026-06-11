import { app, BrowserWindow, desktopCapturer, globalShortcut, session } from "electron";
import path from "path";
import { setupIpcHandlers } from "./ipc";
import log from "electron-log";

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

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools();
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
        // Return the first screen source by default; actual selection done via IPC
        callback({ video: sources[0] });
      })
      .catch((err) => {
        log.error("desktopCapturer.getSources error:", err);
        callback({});
      });
  });

  // Setup IPC handlers
  setupIpcHandlers();

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
