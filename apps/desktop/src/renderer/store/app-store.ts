import { create } from "zustand";

export type AppRoute = "home" | "host-setup" | "host-waiting" | "host-session" | "guest-join" | "guest-session" | "settings" | "permissions";

interface AppState {
  currentRoute: AppRoute;
  permissionStatus: { screenRecording: boolean; accessibility: boolean } | null;
  error: string | null;

  navigate: (route: AppRoute) => void;
  setPermissionStatus: (status: { screenRecording: boolean; accessibility: boolean }) => void;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentRoute: "home",
  permissionStatus: null,
  error: null,

  navigate: (route) => set({ currentRoute: route, error: null }),
  setPermissionStatus: (status) => set({ permissionStatus: status }),
  setError: (error) => set({ error }),
}));
