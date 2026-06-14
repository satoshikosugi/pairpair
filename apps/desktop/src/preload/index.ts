import { contextBridge, ipcRenderer } from "electron";
import type { HostOverlayState, InputEvent } from "@pairpair/shared";
import type { GuestToolboxAction, GuestToolboxState } from "../common/guest-toolbox";

// Expose only specific, named wrappers - never expose ipcRenderer.send directly
contextBridge.exposeInMainWorld("pairpair", {
  platform: process.platform as "darwin" | "win32" | "linux",

  // Screen
  getScreenSources: () => ipcRenderer.invoke("screen:getSources"),
  setSelectedSource: (sourceId: string) => ipcRenderer.invoke("screen:setSelectedSource", sourceId),

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
  setSessionRole: (role: "host" | "guest" | null) => ipcRenderer.invoke("session:setRole", role),
  setGuestFullscreen: (fullscreen: boolean) => ipcRenderer.invoke("session:setGuestFullscreen", fullscreen),

  // Event listeners
  onShortcut: (callback: (action: string) => void) => {
    ipcRenderer.on("session:shortcut", (_event, action: string) => callback(action));
  },
  removeShortcutListener: () => {
    ipcRenderer.removeAllListeners("session:shortcut");
  },
  onFullscreenChanged: (callback: (fullscreen: boolean) => void) => {
    ipcRenderer.on("session:fullscreen-changed", (_event, fullscreen: boolean) => callback(fullscreen));
  },
  removeFullscreenChangedListener: () => {
    ipcRenderer.removeAllListeners("session:fullscreen-changed");
  },
  onPromoteGuestToHost: (callback: () => void) => {
    ipcRenderer.on("session:promote-guest-to-host", callback);
  },
  removePromoteGuestToHostListener: () => {
    ipcRenderer.removeAllListeners("session:promote-guest-to-host");
  },

  // System-wide activity monitor (for host adaptive quality)
  startActivityMonitor: () => ipcRenderer.invoke("activity:start"),
  stopActivityMonitor: () => ipcRenderer.invoke("activity:stop"),
  onSystemActivity: (callback: () => void) => {
    ipcRenderer.on("activity:detected", callback);
  },
  removeSystemActivityListener: () => {
    ipcRenderer.removeAllListeners("activity:detected");
  },

  // Host overlay window
  showHostOverlay: () => ipcRenderer.invoke("overlay:show"),
  hideHostOverlay: () => ipcRenderer.invoke("overlay:hide"),
  updateHostOverlay: (state: HostOverlayState) => ipcRenderer.invoke("overlay:update", state),

  // Guest toolbox window
  openGuestToolbox: () => ipcRenderer.invoke("toolbox:guest:open"),
  closeGuestToolbox: () => ipcRenderer.invoke("toolbox:guest:close"),
  updateGuestToolboxState: (state: GuestToolboxState) => ipcRenderer.invoke("toolbox:guest:updateState", state),
  sendGuestToolboxAction: (action: GuestToolboxAction) => ipcRenderer.invoke("toolbox:guest:action", action),
  onGuestToolboxState: (callback: (state: GuestToolboxState) => void) => {
    ipcRenderer.on("toolbox:guest-state", (_event, state: GuestToolboxState) => callback(state));
  },
  removeGuestToolboxStateListener: () => {
    ipcRenderer.removeAllListeners("toolbox:guest-state");
  },
  onGuestToolboxAction: (callback: (action: GuestToolboxAction) => void) => {
    ipcRenderer.on("toolbox:guest-action", (_event, action: GuestToolboxAction) => callback(action));
  },
  removeGuestToolboxActionListener: () => {
    ipcRenderer.removeAllListeners("toolbox:guest-action");
  },

  // Mac ゲスト用 IME モード変化通知（TIS ポーリング経由）
  // ABC/あボタンクリック、英数/かなキー、Ctrl+Space、Globeキーなどすべての切り替え方法をカバーする
  onImeKey: (callback: (input: { mode: string }) => void) => {
    ipcRenderer.on("session:ime-mode", (_event, input: { mode: string }) => callback(input));
  },
  removeImeKeyListener: () => {
    ipcRenderer.removeAllListeners("session:ime-mode");
  },
});

declare global {
  interface Window {
    pairpair: {
      platform: "darwin" | "win32" | "linux";
      getScreenSources: () => Promise<ScreenSource[]>;
      setSelectedSource: (sourceId: string) => Promise<boolean>;
      checkPermissions: () => Promise<{ screenRecording: boolean; accessibility: boolean }>;
      openSystemSettings: (type: string) => Promise<void>;
      getSettings: (key?: string) => Promise<unknown>;
      setSettings: (key: string, value: unknown) => Promise<boolean>;
      getAllSettings: () => Promise<Record<string, unknown>>;
      injectInput: (event: InputEvent) => Promise<boolean>;
      registerShortcuts: (isHost: boolean) => Promise<void>;
      unregisterShortcuts: () => Promise<void>;
      setSessionRole: (role: "host" | "guest" | null) => Promise<boolean>;
      setGuestFullscreen: (fullscreen: boolean) => Promise<boolean>;
      onShortcut: (callback: (action: string) => void) => void;
      removeShortcutListener: () => void;
      onFullscreenChanged: (callback: (fullscreen: boolean) => void) => void;
      removeFullscreenChangedListener: () => void;
      onPromoteGuestToHost: (callback: () => void) => void;
      removePromoteGuestToHostListener: () => void;
      startActivityMonitor: () => Promise<void>;
      stopActivityMonitor: () => Promise<void>;
      onSystemActivity: (callback: () => void) => void;
      removeSystemActivityListener: () => void;
      showHostOverlay: () => Promise<void>;
      hideHostOverlay: () => Promise<void>;
      updateHostOverlay: (state: HostOverlayState) => Promise<void>;
      openGuestToolbox: () => Promise<boolean>;
      closeGuestToolbox: () => Promise<boolean>;
      updateGuestToolboxState: (state: GuestToolboxState) => Promise<boolean>;
      sendGuestToolboxAction: (action: GuestToolboxAction) => Promise<boolean>;
      onGuestToolboxState: (callback: (state: GuestToolboxState) => void) => void;
      removeGuestToolboxStateListener: () => void;
      onGuestToolboxAction: (callback: (action: GuestToolboxAction) => void) => void;
      removeGuestToolboxActionListener: () => void;
      onImeKey: (callback: (input: { mode: string }) => void) => void;
      removeImeKeyListener: () => void;
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
