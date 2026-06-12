import React, { useState, useEffect, useCallback, useRef } from "react";
import type { KeyboardDownEvent, KeyboardUpEvent, TextInputEvent, QualityPresetName, QualityPreset, InputEvent } from "@pairpair/shared";
import { QUALITY_PRESETS, calcBitrateMbps } from "@pairpair/shared";
import { useAppStore } from "../store/app-store";
import { useSessionStore } from "../store/session-store";
import { useSettingsStore } from "../store/settings-store";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { StatsOverlay } from "../components/StatsOverlay";
import { PermissionPanel } from "../components/PermissionPanel";
import { RemoteVideoView } from "../components/RemoteVideoView";
import { QualityPresetSelector } from "../components/QualityPresetSelector";
import { closePeerConnection, applyQualityPreset, setAdaptiveParameters, getPeerConnection } from "../webrtc/rtc-client";
import { signalingClient } from "../webrtc/signaling-client";
import { startStatsMonitor, stopStatsMonitor, type WebRTCStats } from "../webrtc/stats-monitor";
import { startMetricsCollection, startSharpnessAnalysis } from "../utils/quality-metrics";
import { dataChannelManager } from "../webrtc/data-channel";
import { adaptiveQualityController } from "../webrtc/adaptive-quality";

export function SessionPage(): React.ReactElement {
  const { navigate } = useAppStore();
  const { role, hostDeviceName, guestDeviceName, connectionState, controlState, currentQualityPreset, customQualityPreset, adaptiveModeActive, adaptiveBasePreset } = useSessionStore();
  const { pairproProfiles } = useSettingsStore();
  const [stats, setStats] = useState<WebRTCStats>({});
  const [showStats, setShowStats] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<QualityPresetName>(currentQualityPreset);
  const [customPreset, setCustomPreset] = useState<Partial<QualityPreset>>(customQualityPreset);
  const [adaptiveMode, setAdaptiveMode] = useState(adaptiveModeActive);
  const [adaptiveState, setAdaptiveState] = useState(adaptiveQualityController.state);
  const [adaptiveResPreset, setAdaptiveResPreset] = useState<Exclude<QualityPresetName, "Custom">>(
    (adaptiveBasePreset !== "Custom" ? adaptiveBasePreset : "Balanced") as Exclude<QualityPresetName, "Custom">
  );
  const adaptiveInputHandlerRef = useRef<((e: InputEvent) => void) | null>(null);
  const hasAutoEnabledRef = useRef(false);
  const metricsStopRef = useRef<(() => void) | null>(null);
  const sharpnessStopRef = useRef<(() => void) | null>(null);
  const isHost = role === "host";

  const STATE_LABEL: Record<string, string> = {
    idle: "アイドル", mouse_moving: "マウス移動", scrolling: "スクロール", typing: "タイプ中", clicking: "クリック",
  };

  const enableAdaptive = useCallback((resPreset?: Exclude<QualityPresetName, "Custom">) => {
    const basePresetName = resPreset ?? adaptiveResPreset;
    // Resolution is already set at connection time — only update controller resolution reference
    useSessionStore.getState().setAdaptiveBasePreset(basePresetName);

    const handler = (event: InputEvent) => adaptiveQualityController.onInputEvent(event);
    adaptiveInputHandlerRef.current = handler;
    dataChannelManager.onInput(handler);
    adaptiveQualityController.enable(
      pairproProfiles,
      (fps, bitrateMbps) => { void setAdaptiveParameters(fps, bitrateMbps); },
      QUALITY_PRESETS[basePresetName].width,
      QUALITY_PRESETS[basePresetName].height,
    );
    useSessionStore.getState().setAdaptiveModeActive(true);
    setAdaptiveMode(true);
  }, [pairproProfiles, adaptiveResPreset]);

  const disableAdaptive = useCallback(() => {
    adaptiveQualityController.disable();
    if (adaptiveInputHandlerRef.current) {
      dataChannelManager.offInput(adaptiveInputHandlerRef.current);
      adaptiveInputHandlerRef.current = null;
    }
    const preset = selectedPreset === "Custom"
      ? ({ ...customPreset, name: "Custom" } as QualityPreset)
      : QUALITY_PRESETS[selectedPreset as Exclude<QualityPresetName, "Custom">];
    void applyQualityPreset(preset).catch(console.warn);
    useSessionStore.getState().setAdaptiveModeActive(false);
    setAdaptiveMode(false);
  }, [selectedPreset, customPreset]);

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
      // Cleanup adaptive mode
      adaptiveQualityController.disable();
      if (adaptiveInputHandlerRef.current) {
        dataChannelManager.offInput(adaptiveInputHandlerRef.current);
        adaptiveInputHandlerRef.current = null;
      }
    };
  }, [handleDisconnect, isHost]);

  // Re-enable adaptive on mount if it was active (HostPage cleanup disabled it)
  useEffect(() => {
    if (isHost && adaptiveModeActive && !hasAutoEnabledRef.current) {
      hasAutoEnabledRef.current = true;
      enableAdaptive();
    }
  }, [isHost, adaptiveModeActive, enableAdaptive]);

  // Host-side system-wide activity detection via powerMonitor (works even when PairPair is not focused)
  useEffect(() => {
    if (!isHost || !adaptiveMode) return;
    void window.pairpair.startActivityMonitor();
    window.pairpair.onSystemActivity(() => {
      adaptiveQualityController.notifyActivity("mouse_moving");
    });
    return () => {
      window.pairpair.removeSystemActivityListener();
      void window.pairpair.stopActivityMonitor();
    };
  }, [isHost, adaptiveMode]);

  // Guest-side: auto-collect WebRTC quality metrics and frame sharpness
  useEffect(() => {
    if (isHost) return; // Only for guest

    const pc = getPeerConnection();
    if (!pc) return; // Wait for peer connection

    console.log("[QualityTest] Starting metrics collection for guest role");

    // Collect WebRTC stats every 5 seconds
    metricsStopRef.current = startMetricsCollection(pc, 5000);

    // Find remote video element and analyze sharpness every 10 seconds
    const videoEl = document.querySelector("video[data-remote]") as HTMLVideoElement | null;
    if (videoEl) {
      sharpnessStopRef.current = startSharpnessAnalysis(videoEl, 10000);
    }

    return () => {
      if (metricsStopRef.current) {
        metricsStopRef.current();
        metricsStopRef.current = null;
      }
      if (sharpnessStopRef.current) {
        sharpnessStopRef.current();
        sharpnessStopRef.current = null;
      }
    };
  }, [isHost]);

  // Sync adaptive state label every 500ms when adaptive mode is on
  useEffect(() => {
    if (!adaptiveMode) return;
    const timer = setInterval(() => setAdaptiveState(adaptiveQualityController.state), 500);
    return () => clearInterval(timer);
  }, [adaptiveMode]);

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

          <div style={{ width: "100%", maxWidth: 400, marginTop: 24, marginBottom: 24 }}>
            <h4 style={{ color: "#aaa", marginBottom: 12 }}>画質設定</h4>

            {/* Mode selector tabs */}
            <div style={{ display: "flex", gap: 0, marginBottom: 12, borderRadius: 6, overflow: "hidden", border: "1px solid #444" }}>
              {[
                { key: false, label: "従来のプリセット" },
                { key: true,  label: "適応モード（PairPro）" },
              ].map(({ key, label }) => (
                <button
                  key={String(key)}
                  onClick={() => key ? enableAdaptive() : disableAdaptive()}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    background: adaptiveMode === key ? "#4a9eff" : "#1a1a2e",
                    color: adaptiveMode === key ? "#fff" : "#888",
                    border: "none",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {!adaptiveMode ? (
              <QualityPresetSelector
                selected={selectedPreset}
                customPreset={customPreset}
                onChange={(preset, custom) => {
                  setSelectedPreset(preset);
                  if (custom) setCustomPreset(custom);
                  useSessionStore.getState().setCurrentQualityPreset(preset, custom);
                  const qualityPreset = preset === "Custom"
                    ? ({ ...custom, name: preset } as QualityPreset)
                    : QUALITY_PRESETS[preset as Exclude<QualityPresetName, "Custom">];
                  void applyQualityPreset(qualityPreset).catch(console.error);
                }}
              />
            ) : (
              <div style={{ background: "#1a1a2e", border: "1px solid #2a2a4e", borderRadius: 6, padding: "12px 16px", fontSize: 12 }}>
                {/* Resolution selector */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ color: "#888" }}>解像度:</span>
                  <select
                    value={adaptiveResPreset}
                    onChange={(e) => {
                      const p = e.target.value as Exclude<QualityPresetName, "Custom">;
                      setAdaptiveResPreset(p);
                      const basePreset = QUALITY_PRESETS[p];
                      void applyQualityPreset(basePreset).then(() => {
                        adaptiveQualityController.setResolution(basePreset.width, basePreset.height);
                      });
                      useSessionStore.getState().setAdaptiveBasePreset(p);
                    }}
                    style={{ background: "#2a2a3e", color: "#fff", border: "1px solid #444", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}
                  >
                    {(["Low", "Balanced", "Sharp", "Ultra"] as const).map((p) => (
                      <option key={p} value={p}>{p} ({QUALITY_PRESETS[p].resolution})</option>
                    ))}
                  </select>
                </div>
                <div style={{ color: "#4a9eff", marginBottom: 6 }}>
                  \u72b6\u614b: {STATE_LABEL[adaptiveState]} \u2014 {pairproProfiles[adaptiveState].fps} fps / {calcBitrateMbps(pairproProfiles[adaptiveState].quality, QUALITY_PRESETS[adaptiveResPreset].width, QUALITY_PRESETS[adaptiveResPreset].height, pairproProfiles[adaptiveState].fps)} Mbps
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {(["idle", "mouse_moving", "scrolling", "typing", "clicking"] as const).map((s) => (
                      <tr key={s} style={{ opacity: s === adaptiveState ? 1 : 0.45 }}>
                        <td style={{ color: "#888", paddingRight: 12 }}>{STATE_LABEL[s]}</td>
                        <td style={{ color: "#fff", paddingRight: 12 }}>{pairproProfiles[s].fps} fps</td>
                        <td style={{ color: "#fff", paddingRight: 12 }}>{pairproProfiles[s].quality}%</td>
                        <td style={{ color: "#666" }}>{calcBitrateMbps(pairproProfiles[s].quality, QUALITY_PRESETS[adaptiveResPreset].width, QUALITY_PRESETS[adaptiveResPreset].height, pairproProfiles[s].fps)} Mbps</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

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
