import type { HostOverlayState, InputEvent } from "@pairpair/shared";
import type { GuestToolboxAction, GuestToolboxState } from "../common/guest-toolbox";

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
      getMacInputSourceMode: () => Promise<"japanese" | "latin" | null>;
      registerShortcuts: (isHost: boolean) => Promise<void>;
      unregisterShortcuts: () => Promise<void>;
      setSessionRole: (role: "host" | "guest" | null) => Promise<boolean>;
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
      openGuestToolbox: () => Promise<boolean>;
      closeGuestToolbox: () => Promise<boolean>;
      updateGuestToolboxState: (state: GuestToolboxState) => Promise<boolean>;
      sendGuestToolboxAction: (action: GuestToolboxAction) => Promise<boolean>;
      onGuestToolboxState: (callback: (state: GuestToolboxState) => void) => void;
      removeGuestToolboxStateListener: () => void;
      onGuestToolboxAction: (callback: (action: GuestToolboxAction) => void) => void;
      removeGuestToolboxActionListener: () => void;
      onPromoteGuestToHost: (callback: () => void) => void;
      removePromoteGuestToHostListener: () => void;
      onImeKey: (callback: (input: { mode: string }) => void) => void;
      removeImeKeyListener: () => void;
    };
  }
}

export {};
