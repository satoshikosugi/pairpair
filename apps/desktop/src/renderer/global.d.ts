import type { InputEvent } from "@pairpair/shared";

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
}

export {};
