import { BrowserWindow } from "electron";
import path from "path";
import type { GuestToolboxAction, GuestToolboxState } from "../../common/guest-toolbox";
import { getMainWindow } from "../window";
import guestToolboxHtml from "./guest-toolbox.html?raw";

let guestToolboxWindow: BrowserWindow | null = null;
let lastGuestToolboxState: GuestToolboxState | null = null;

export async function showGuestToolboxWindow(): Promise<void> {
  if (guestToolboxWindow && !guestToolboxWindow.isDestroyed()) {
    if (guestToolboxWindow.isMinimized()) {
      guestToolboxWindow.restore();
    }
    guestToolboxWindow.show();
    guestToolboxWindow.focus();
    guestToolboxWindow.moveTop();
    if (lastGuestToolboxState) {
      guestToolboxWindow.webContents.send("toolbox:guest-state", lastGuestToolboxState);
    }
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

  guestToolboxWindow.on("closed", () => {
    guestToolboxWindow = null;
  });

  guestToolboxWindow.webContents.on("did-finish-load", () => {
    if (!guestToolboxWindow || guestToolboxWindow.isDestroyed() || !lastGuestToolboxState) {
      return;
    }
    guestToolboxWindow.webContents.send("toolbox:guest-state", lastGuestToolboxState);
  });

  await guestToolboxWindow.loadURL("about:blank");
  await guestToolboxWindow.webContents.executeJavaScript(
    `document.open();document.write(${JSON.stringify(guestToolboxHtml)});document.close();`,
    true,
  );
  guestToolboxWindow.show();
  guestToolboxWindow.focus();
  guestToolboxWindow.moveTop();
  if (lastGuestToolboxState) {
    guestToolboxWindow.webContents.send("toolbox:guest-state", lastGuestToolboxState);
  }
}

export function closeGuestToolboxWindow(): void {
  if (guestToolboxWindow && !guestToolboxWindow.isDestroyed()) {
    guestToolboxWindow.close();
  }
  guestToolboxWindow = null;
}

export function updateGuestToolboxState(state: GuestToolboxState): void {
  lastGuestToolboxState = state;
  if (!guestToolboxWindow || guestToolboxWindow.isDestroyed()) {
    return;
  }
  guestToolboxWindow.webContents.send("toolbox:guest-state", state);
}

export function relayGuestToolboxAction(action: GuestToolboxAction): void {
  const mainWindow = guestToolboxWindow?.getParentWindow() ?? getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("toolbox:guest-action", action);
}
