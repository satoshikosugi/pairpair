import { create } from "zustand";
import type { QualityPresetName, PairProActivityState, PairProProfile } from "@pairpair/shared";
import { PAIRPRO_DEFAULT_PROFILES } from "@pairpair/shared";
import type { RecentSessionSnapshot } from "../session-resume";

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
  wheelDirection: "standard" | "natural";
  lastSourceName: string | null;
  lastSourceDisplayId: string | null;
  lastHostPreset: QualityPresetName;
  lastHostCustomPreset: Record<string, unknown>;
  lastHostAdaptiveMode: boolean;
  lastHostAdaptiveBasePreset: QualityPresetName;
  recentSession: RecentSessionSnapshot | null;
  pairproProfiles: Record<PairProActivityState, PairProProfile>;
  loaded: boolean;

  setDefaultPreset: (preset: QualityPresetName) => void;
  setStunServer: (url: string) => void;
  setConnectionTimeout: (seconds: number) => void;
  setShowCursor: (show: boolean) => void;
  setAdaptiveModeEnabled: (enabled: boolean) => void;
  setPairproProfile: (state: PairProActivityState, profile: PairProProfile) => void;
  resetPairproProfiles: () => void;
  setRecentSession: (snapshot: RecentSessionSnapshot | null) => Promise<void>;
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
  wheelDirection: "standard",
  lastSourceName: null,
  lastSourceDisplayId: null,
  lastHostPreset: "Balanced",
  lastHostCustomPreset: {},
  lastHostAdaptiveMode: false,
  lastHostAdaptiveBasePreset: "Balanced",
  recentSession: null,
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
  setRecentSession: async (snapshot) => {
    set({ recentSession: snapshot });
    await window.pairpair.setSettings("recentSession", snapshot);
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
        wheelDirection: (settings.wheelDirection as "standard" | "natural") ?? "standard",
        lastSourceName: (settings.lastSourceName as string | null) ?? null,
        lastSourceDisplayId: (settings.lastSourceDisplayId as string | null) ?? null,
        lastHostPreset: (settings.lastHostPreset as QualityPresetName) ?? "Balanced",
        lastHostCustomPreset: (settings.lastHostCustomPreset as Record<string, unknown>) ?? {},
        lastHostAdaptiveMode: (settings.lastHostAdaptiveMode as boolean) ?? false,
        lastHostAdaptiveBasePreset: (settings.lastHostAdaptiveBasePreset as QualityPresetName) ?? "Balanced",
        recentSession: (settings.recentSession as RecentSessionSnapshot | null) ?? null,
        pairproProfiles: (() => {
          const raw = settings.pairproProfiles as Record<string, Record<string, unknown>> | undefined;
          if (raw && typeof raw === "object") {
            const entries = Object.values(raw);
            const isValid = entries.length >= 5 && entries.every((s) => {
              const q = s["quality"];
              const f = s["fps"];
              // Validate ranges: quality 1–100, fps 1–60
              return typeof q === "number" && q >= 1 && q <= 100
                  && typeof f === "number" && f >= 1 && f <= 60;
            });
            if (isValid) {
              return raw as unknown as Record<PairProActivityState, PairProProfile>;
            }
          }
          // Missing, stale format, or out-of-range values — reset to defaults
          void window.pairpair.setSettings("pairproProfiles", { ...PAIRPRO_DEFAULT_PROFILES });
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
