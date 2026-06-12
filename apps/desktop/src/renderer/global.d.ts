import type { HostOverlayState, InputEvent } from "@pairpair/shared";

interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
  display_id: string;
  appIcon: string | null;
}

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
      setGuestFullscreen: (fullscreen: boolean) => Promise<boolean>;
      onShortcut: (callback: (action: string) => void) => void;
      removeShortcutListener: () => void;
      onFullscreenChanged: (callback: (fullscreen: boolean) => void) => void;
      removeFullscreenChangedListener: () => void;
      startActivityMonitor: () => Promise<void>;
      stopActivityMonitor: () => Promise<void>;
      onSystemActivity: (callback: () => void) => void;
      removeSystemActivityListener: () => void;
      showHostOverlay: () => Promise<void>;
      hideHostOverlay: () => Promise<void>;
      updateHostOverlay: (state: HostOverlayState) => Promise<void>;
    };
  }
}

export {};
