import { ipcMain } from "electron";
import Store from "electron-store";
import log from "electron-log";

const store = new Store({
  defaults: {
    defaultPreset: "Balanced",
    stunServer: "stun:stun.l.google.com:19302",
    connectionTimeout: 30,
    showCursor: true,
    confirmOnExit: true,
    saveLastSettings: true,
    logEnabled: true,
    requirePermissionConfirm: true,
  },
});

export function setupSettingsIpc(): void {
  ipcMain.handle("settings:get", (_event, key?: string) => {
    if (key) {
      return store.get(key);
    }
    return store.store;
  });

  ipcMain.handle("settings:set", (_event, key: string, value: unknown) => {
    try {
      store.set(key, value);
      return true;
    } catch (err) {
      log.error("settings:set error:", err);
      return false;
    }
  });

  ipcMain.handle("settings:getAll", () => {
    return store.store;
  });
}
