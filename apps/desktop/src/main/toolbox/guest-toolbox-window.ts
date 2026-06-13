import { BrowserWindow } from "electron";
import path from "path";
import type { GuestToolboxAction, GuestToolboxState } from "../../common/guest-toolbox";
import { getMainWindow } from "../main";

let guestToolboxWindow: BrowserWindow | null = null;

function buildToolboxUrl(): string {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (!rendererUrl) {
    return "";
  }
  const url = new URL(rendererUrl);
  url.searchParams.set("view", "guest-toolbox");
  return url.toString();
}

export async function showGuestToolboxWindow(): Promise<void> {
  if (guestToolboxWindow && !guestToolboxWindow.isDestroyed()) {
    guestToolboxWindow.show();
    guestToolboxWindow.focus();
    return;
  }

  const parent = getMainWindow();
  guestToolboxWindow = new BrowserWindow({
    parent: parent ?? undefined,
    width: 360,
    height: 420,
    minWidth: 320,
    minHeight: 360,
    maxWidth: 420,
    maximizable: false,
    resizable: true,
    minimizable: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    title: "PairPair マーカーツール",
    backgroundColor: "#0b1020",
    webPreferences: {
      preload: path.join(__dirname, "../../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    show: false,
  });

  guestToolboxWindow.once("ready-to-show", () => {
    guestToolboxWindow?.show();
  });

  guestToolboxWindow.on("closed", () => {
    guestToolboxWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await guestToolboxWindow.loadURL(buildToolboxUrl());
  } else {
    await guestToolboxWindow.loadFile(path.join(__dirname, "../../renderer/index.html"), {
      query: { view: "guest-toolbox" },
    });
  }
}

export function closeGuestToolboxWindow(): void {
  if (guestToolboxWindow && !guestToolboxWindow.isDestroyed()) {
    guestToolboxWindow.close();
  }
  guestToolboxWindow = null;
}

export function updateGuestToolboxState(state: GuestToolboxState): void {
  if (!guestToolboxWindow || guestToolboxWindow.isDestroyed()) {
    return;
  }
  guestToolboxWindow.webContents.send("toolbox:guest-state", state);
}

export function relayGuestToolboxAction(action: GuestToolboxAction): void {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("toolbox:guest-action", action);
}
