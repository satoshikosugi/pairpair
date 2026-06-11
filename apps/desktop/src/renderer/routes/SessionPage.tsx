import React, { useState, useEffect, useCallback } from "react";
import type { KeyboardDownEvent, KeyboardUpEvent, TextInputEvent } from "@pairpair/shared";
import { useAppStore } from "../store/app-store";
import { useSessionStore } from "../store/session-store";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { StatsOverlay } from "../components/StatsOverlay";
import { PermissionPanel } from "../components/PermissionPanel";
import { RemoteVideoView } from "../components/RemoteVideoView";
import { closePeerConnection } from "../webrtc/rtc-client";
import { signalingClient } from "../webrtc/signaling-client";
import { startStatsMonitor, stopStatsMonitor, type WebRTCStats } from "../webrtc/stats-monitor";
import { dataChannelManager } from "../webrtc/data-channel";

export function SessionPage(): React.ReactElement {
  const { navigate } = useAppStore();
  const { role, hostDeviceName, guestDeviceName, connectionState, controlState } = useSessionStore();
  const [stats, setStats] = useState<WebRTCStats>({});
  const [showStats, setShowStats] = useState(false);
  const isHost = role === "host";

  const handleDisconnect = useCallback(() => {
    signalingClient.send({ type: "session.close", payload: { reason: isHost ? "host_closed" : "guest_disconnected" } });
    signalingClient.disconnect();
    closePeerConnection();
    useSessionStore.getState().reset();
    navigate("home");
  }, [isHost, navigate]);

  useEffect(() => {
    startStatsMonitor(setStats);
    void window.pairpair.registerShortcuts(isHost).catch(console.error);

    window.pairpair.onShortcut((action) => {
      if (action === "pause") {
        useSessionStore.getState().setControlState("controlPaused");
        dataChannelManager.sendControl({ type: "remoteControl.paused" });
      } else if (action === "revoke") {
        useSessionStore.getState().setControlState("controlRevoked");
        dataChannelManager.sendControl({ type: "remoteControl.revoked" });
      } else if (action === "end") {
        handleDisconnect();
      }
    });

    return () => {
      stopStatsMonitor();
      void window.pairpair.unregisterShortcuts().catch(console.error);
      window.pairpair.removeShortcutListener();
    };
  }, [handleDisconnect, isHost]);

  useEffect(() => {
    if (isHost) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (controlState !== "controlAllowed") return;
      e.preventDefault();
      const event: KeyboardDownEvent = {
        type: "keyboard.down",
        code: e.code,
        key: e.key,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      };
      dataChannelManager.sendInput(event);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (controlState !== "controlAllowed") return;
      e.preventDefault();
      const event: KeyboardUpEvent = {
        type: "keyboard.up",
        code: e.code,
        key: e.key,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      };
      dataChannelManager.sendInput(event);
    };

    const handleInput = (e: Event) => {
      if (controlState !== "controlAllowed") return;
      const inputEvent = e as InputEvent;
      if (inputEvent.data) {
        const event: TextInputEvent = { type: "text.input", text: inputEvent.data };
        dataChannelManager.sendInput(event);
      }
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    document.addEventListener("keyup", handleKeyUp, { capture: true });
    document.addEventListener("input", handleInput, { capture: true });

    return () => {
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
      document.removeEventListener("keyup", handleKeyUp, { capture: true });
      document.removeEventListener("input", handleInput, { capture: true });
    };
  }, [controlState, isHost]);

  if (isHost) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div
          style={{
            padding: "12px 16px",
            background: "#16213e",
            borderBottom: "1px solid #333",
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontWeight: "bold", color: "#4a9eff" }}>PairPair - ホスト中</span>
          <ConnectionStatus />
          <span style={{ color: "#aaa", fontSize: 13 }}>接続先: {guestDeviceName ?? "---"}</span>
          <span style={{ color: "#aaa", fontSize: 13 }}>{connectionState === "connected" ? "P2P接続済み" : "接続中..."}</span>
          <StatsOverlay stats={stats} visible={showStats} onToggle={() => setShowStats(!showStats)} />
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div style={{ color: "#aaa", marginBottom: 8 }}>画面を共有中</div>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button
              onClick={handleDisconnect}
              style={{ padding: "10px 24px", background: "#ff4444", color: "#fff", border: "none", borderRadius: 8 }}
            >
              セッション終了
            </button>
          </div>
        </div>

        <PermissionPanel role="host" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "8px 16px",
          background: "#16213e",
          borderBottom: "1px solid #333",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: "bold", color: "#4a9eff" }}>PairPair - ゲスト</span>
        <ConnectionStatus />
        <span style={{ color: "#aaa", fontSize: 13 }}>{hostDeviceName ?? "Host"}</span>
        <StatsOverlay stats={stats} visible={showStats} onToggle={() => setShowStats(!showStats)} />
        <button
          onClick={handleDisconnect}
          style={{
            marginLeft: "auto",
            padding: "4px 14px",
            background: "transparent",
            color: "#ff4444",
            border: "1px solid #ff4444",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          切断
        </button>
      </div>

      <RemoteVideoView />

      <PermissionPanel role="guest" />
    </div>
  );
}
