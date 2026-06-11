import { create } from "zustand";

export type ControlState = "viewOnly" | "controlRequested" | "controlAllowed" | "controlPaused" | "controlRevoked";
export type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "failed";
export type SessionRole = "host" | "guest" | null;

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
};

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
  reset: () => set(initialState),
}));
