import { contextBridge, ipcRenderer } from "electron";
import type { InputEvent } from "@pairpair/shared";

// Expose only specific, named wrappers - never expose ipcRenderer.send directly
contextBridge.exposeInMainWorld("pairpair", {
  platform: process.platform as "darwin" | "win32" | "linux",

  // Screen
  getScreenSources: () => ipcRenderer.invoke("screen:getSources"),

  // Permissions
  checkPermissions: () => ipcRenderer.invoke("permissions:check"),
  openSystemSettings: (type: string) => ipcRenderer.invoke("permissions:openSystemSettings", type),

  // Settings
  getSettings: (key?: string) => ipcRenderer.invoke("settings:get", key),
  setSettings: (key: string, value: unknown) => ipcRenderer.invoke("settings:set", key, value),
  getAllSettings: () => ipcRenderer.invoke("settings:getAll"),

  // Input injection
  injectInput: (event: InputEvent) => ipcRenderer.invoke("input:inject", event),

  // Session shortcuts
  registerShortcuts: (isHost: boolean) => ipcRenderer.invoke("session:registerShortcuts", isHost),
  unregisterShortcuts: () => ipcRenderer.invoke("session:unregisterShortcuts"),

  // Event listeners
  onShortcut: (callback: (action: string) => void) => {
    ipcRenderer.on("session:shortcut", (_event, action: string) => callback(action));
  },
  removeShortcutListener: () => {
    ipcRenderer.removeAllListeners("session:shortcut");
  },
});

declare global {
  interface Window {
    pairpair: {
      platform: "darwin" | "win32" | "linux";
      getScreenSources: () => Promise<ScreenSource[]>;
      checkPermissions: () => Promise<{ screenRecording: boolean; accessibility: boolean }>;
      openSystemSettings: (type: string) => Promise<void>;
      getSettings: (key?: string) => Promise<unknown>;
      setSettings: (key: string, value: unknown) => Promise<boolean>;
      getAllSettings: () => Promise<Record<string, unknown>>;
      injectInput: (event: InputEvent) => Promise<boolean>;
      registerShortcuts: (isHost: boolean) => Promise<void>;
      unregisterShortcuts: () => Promise<void>;
      onShortcut: (callback: (action: string) => void) => void;
      removeShortcutListener: () => void;
    };
  }

  interface ScreenSource {
    id: string;
    name: string;
    thumbnail: string;
    display_id: string;
    appIcon: string | null;
  }
}
