import { create } from "zustand";
import type { QualityPresetName } from "@pairpair/shared";

interface SettingsState {
  defaultPreset: QualityPresetName;
  stunServer: string;
  connectionTimeout: number;
  showCursor: boolean;
  confirmOnExit: boolean;
  saveLastSettings: boolean;
  logEnabled: boolean;
  requirePermissionConfirm: boolean;
  loaded: boolean;

  setDefaultPreset: (preset: QualityPresetName) => void;
  setStunServer: (url: string) => void;
  setConnectionTimeout: (seconds: number) => void;
  setShowCursor: (show: boolean) => void;
  loadFromElectron: () => Promise<void>;
  saveToElectron: (key: string, value: unknown) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  defaultPreset: "Balanced",
  stunServer: "stun:stun.l.google.com:19302",
  connectionTimeout: 30,
  showCursor: true,
  confirmOnExit: true,
  saveLastSettings: true,
  logEnabled: true,
  requirePermissionConfirm: true,
  loaded: false,

  setDefaultPreset: (preset) => set({ defaultPreset: preset }),
  setStunServer: (url) => set({ stunServer: url }),
  setConnectionTimeout: (seconds) => set({ connectionTimeout: seconds }),
  setShowCursor: (show) => set({ showCursor: show }),

  loadFromElectron: async () => {
    try {
      const settings = (await window.pairpair.getAllSettings()) as Record<string, unknown>;
      set({
        defaultPreset: (settings.defaultPreset as QualityPresetName) ?? "Balanced",
        stunServer: (settings.stunServer as string) ?? "stun:stun.l.google.com:19302",
        connectionTimeout: (settings.connectionTimeout as number) ?? 30,
        showCursor: (settings.showCursor as boolean) ?? true,
        confirmOnExit: (settings.confirmOnExit as boolean) ?? true,
        saveLastSettings: (settings.saveLastSettings as boolean) ?? true,
        logEnabled: (settings.logEnabled as boolean) ?? true,
        requirePermissionConfirm: (settings.requirePermissionConfirm as boolean) ?? true,
        loaded: true,
      });
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  },

  saveToElectron: async (key, value) => {
    set({ [key]: value } as Partial<SettingsState>);
    await window.pairpair.setSettings(key, value);
  },
}));
