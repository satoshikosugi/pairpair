import { useSessionStore } from "../store/session-store";
import { signalingClient } from "./signaling-client";
import { closePeerConnection } from "./rtc-client";
import { stopStatsMonitor } from "./stats-monitor";
import { dataChannelManager } from "./data-channel";

const DISCONNECT_TIMEOUT_MS = 30000;
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function setupConnectionMonitor(onFailure: () => void): () => void {
  const unsubscribe = useSessionStore.subscribe((state) => {
    const { connectionState } = state;

    if (connectionState === "disconnected") {
      if (!disconnectTimer) {
        disconnectTimer = setTimeout(() => {
          if (useSessionStore.getState().connectionState === "disconnected") {
            handleConnectionFailed(onFailure);
          }
        }, DISCONNECT_TIMEOUT_MS);
      }
    } else if (connectionState === "failed") {
      clearDisconnectTimer();
      handleConnectionFailed(onFailure);
    } else if (connectionState === "connected") {
      clearDisconnectTimer();
    }
  });

  return unsubscribe;
}

function clearDisconnectTimer(): void {
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }
}

function handleConnectionFailed(onFailure: () => void): void {
  console.error("[connection-manager] Connection failed");
  cleanupSession();
  onFailure();
}

export function cleanupSession(): void {
  clearDisconnectTimer();
  stopStatsMonitor();
  dataChannelManager.close();
  closePeerConnection();
  signalingClient.disconnect();
}
