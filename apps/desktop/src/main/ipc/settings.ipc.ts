import { ipcMain } from "electron";
import Store from "electron-store";
import log from "electron-log";

// Lazy initialization to prevent module loading issues
let store: Store | null = null;

function getStore(): Store {
  if (!store) {
    store = new Store({
      defaults: {
        nickname: "",
        defaultPreset: "Balanced",
        stunServer: "stun:stun.l.google.com:19302",
        connectionTimeout: 30,
        showCursor: true,
        confirmOnExit: true,
        saveLastSettings: true,
        logEnabled: true,
        requirePermissionConfirm: true,
        wheelDirection: "standard",
        lastSourceName: null,
        lastSourceDisplayId: null,
        lastHostPreset: "Balanced",
        lastHostCustomPreset: {},
        lastHostAdaptiveMode: false,
        lastHostAdaptiveBasePreset: "Balanced",
        recentSession: null,
      },
    });
  }
  return store;
}

export function setupSettingsIpc(): void {
  ipcMain.handle("settings:get", (_event, key?: string) => {
    try {
      const storeInstance = getStore();
      if (key) {
        return storeInstance.get(key);
      }
      return storeInstance.store;
    } catch (err) {
      log.error("settings:get error:", err);
      return null;
    }
  });

  ipcMain.handle("settings:set", (_event, key: string, value: unknown) => {
    try {
      const storeInstance = getStore();
      storeInstance.set(key, value);
      return true;
    } catch (err) {
      log.error("settings:set error:", err);
      return false;
    }
  });

  ipcMain.handle("settings:getAll", () => {
    try {
      return getStore().store;
    } catch (err) {
      log.error("settings:getAll error:", err);
      return {};
    }
  });
}
