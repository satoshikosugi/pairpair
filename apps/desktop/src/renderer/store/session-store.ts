import { create } from "zustand";
import type { QualityPreset, QualityPresetName } from "@pairpair/shared";

export type ControlState = "viewOnly" | "controlRequested" | "controlAllowed" | "controlPaused" | "controlRevoked";
export type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "failed";
export type SessionRole = "host" | "guest" | null;

type OnSessionEndedHandler = () => void;

interface SessionState {
  sessionId: string | null;
  code: string | null;
  role: SessionRole;
  connectionState: ConnectionState;
  signalingState: string;
  iceConnectionState: string;
  controlState: ControlState;
  hostDeviceName: string | null;
  guestDeviceName: string | null;
  selectedSourceId: string | null;
  expiresAt: string | null;
  currentQualityPreset: QualityPresetName;
  customQualityPreset: Partial<QualityPreset>;

  setSessionId: (id: string | null) => void;
  setCode: (code: string | null) => void;
  setRole: (role: SessionRole) => void;
  setConnectionState: (state: ConnectionState) => void;
  setSignalingState: (state: string) => void;
  setIceConnectionState: (state: string) => void;
  setControlState: (state: ControlState) => void;
  setHostDeviceName: (name: string | null) => void;
  setGuestDeviceName: (name: string | null) => void;
  setSelectedSourceId: (id: string | null) => void;
  setExpiresAt: (at: string | null) => void;
  setCurrentQualityPreset: (preset: QualityPresetName, custom?: Partial<QualityPreset>) => void;
  onSessionEnded: (handler: OnSessionEndedHandler) => void;
  emitSessionEnded: () => void;
  reset: () => void;
}

const initialState = {
  sessionId: null,
  code: null,
  role: null as SessionRole,
  connectionState: "idle" as ConnectionState,
  signalingState: "stable",
  iceConnectionState: "new",
  controlState: "viewOnly" as ControlState,
  hostDeviceName: null,
  guestDeviceName: null,
  selectedSourceId: null,
  expiresAt: null,
  currentQualityPreset: "Balanced" as QualityPresetName,
  customQualityPreset: {} as Partial<QualityPreset>,
};

let sessionEndedHandlers: OnSessionEndedHandler[] = [];

export const useSessionStore = create<SessionState>((set) => ({
  ...initialState,
  setSessionId: (id) => set({ sessionId: id }),
  setCode: (code) => set({ code }),
  setRole: (role) => set({ role }),
  setConnectionState: (state) => set({ connectionState: state }),
  setSignalingState: (state) => set({ signalingState: state }),
  setIceConnectionState: (state) => set({ iceConnectionState: state }),
  setControlState: (state) => set({ controlState: state }),
  setHostDeviceName: (name) => set({ hostDeviceName: name }),
  setGuestDeviceName: (name) => set({ guestDeviceName: name }),
  setSelectedSourceId: (id) => set({ selectedSourceId: id }),
  setExpiresAt: (at) => set({ expiresAt: at }),
  setCurrentQualityPreset: (preset, custom) => set({
    currentQualityPreset: preset,
    customQualityPreset: custom ?? {},
  }),
  onSessionEnded: (handler) => {
    sessionEndedHandlers.push(handler);
  },
  emitSessionEnded: () => {
    sessionEndedHandlers.forEach((h) => h());
  },
  reset: () => {
    set(initialState);
    sessionEndedHandlers = [];
  },
}));
