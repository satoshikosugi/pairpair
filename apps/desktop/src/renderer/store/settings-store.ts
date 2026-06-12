import { create } from "zustand";
import type { QualityPresetName, PairProActivityState, PairProProfile } from "@pairpair/shared";
import { PAIRPRO_DEFAULT_PROFILES } from "@pairpair/shared";

interface SettingsState {
  defaultPreset: QualityPresetName;
  stunServer: string;
  connectionTimeout: number;
  showCursor: boolean;
  confirmOnExit: boolean;
  saveLastSettings: boolean;
  logEnabled: boolean;
  requirePermissionConfirm: boolean;
  adaptiveModeEnabled: boolean;
  pairproProfiles: Record<PairProActivityState, PairProProfile>;
  loaded: boolean;

  setDefaultPreset: (preset: QualityPresetName) => void;
  setStunServer: (url: string) => void;
  setConnectionTimeout: (seconds: number) => void;
  setShowCursor: (show: boolean) => void;
  setAdaptiveModeEnabled: (enabled: boolean) => void;
  setPairproProfile: (state: PairProActivityState, profile: PairProProfile) => void;
  resetPairproProfiles: () => void;
  loadFromElectron: () => Promise<void>;
  saveToElectron: (key: string, value: unknown) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  defaultPreset: "Balanced",
  stunServer: "stun:pairpair-signaling-server-245497898064.asia-northeast1.run.app:3478",
  connectionTimeout: 30,
  showCursor: true,
  confirmOnExit: true,
  saveLastSettings: true,
  logEnabled: true,
  requirePermissionConfirm: true,
  adaptiveModeEnabled: false,
  pairproProfiles: { ...PAIRPRO_DEFAULT_PROFILES },
  loaded: false,

  setDefaultPreset: (preset) => set({ defaultPreset: preset }),
  setStunServer: (url) => set({ stunServer: url }),
  setConnectionTimeout: (seconds) => set({ connectionTimeout: seconds }),
  setShowCursor: (show) => set({ showCursor: show }),
  setAdaptiveModeEnabled: (enabled) => set({ adaptiveModeEnabled: enabled }),
  setPairproProfile: (state, profile) => {
    set((s) => {
      const updated = { ...s.pairproProfiles, [state]: profile };
      void window.pairpair.setSettings("pairproProfiles", updated);
      return { pairproProfiles: updated };
    });
  },
  resetPairproProfiles: () => {
    const defaults = { ...PAIRPRO_DEFAULT_PROFILES };
    void window.pairpair.setSettings("pairproProfiles", defaults);
    set({ pairproProfiles: defaults });
  },

  loadFromElectron: async () => {
    try {
      const settings = (await window.pairpair.getAllSettings()) as Record<string, unknown>;
      set({
        defaultPreset: (settings.defaultPreset as QualityPresetName) ?? "Balanced",
        stunServer: (settings.stunServer as string) ?? "stun:pairpair-signaling-server-245497898064.asia-northeast1.run.app:3478",
        connectionTimeout: (settings.connectionTimeout as number) ?? 30,
        showCursor: (settings.showCursor as boolean) ?? true,
        confirmOnExit: (settings.confirmOnExit as boolean) ?? true,
        saveLastSettings: (settings.saveLastSettings as boolean) ?? true,
        logEnabled: (settings.logEnabled as boolean) ?? true,
        requirePermissionConfirm: (settings.requirePermissionConfirm as boolean) ?? true,
        adaptiveModeEnabled: (settings.adaptiveModeEnabled as boolean) ?? false,
        pairproProfiles: (() => {
          const raw = settings.pairproProfiles as Record<string, Record<string, unknown>> | undefined;
          if (raw && typeof raw === "object") {
            const sample = Object.values(raw)[0];
            if (sample && "quality" in sample) {
              // New format
              return raw as unknown as Record<PairProActivityState, PairProProfile>;
            }
          }
          // Old format (bitrateMbps) or missing — reset to defaults
          return { ...PAIRPRO_DEFAULT_PROFILES };
        })(),
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
