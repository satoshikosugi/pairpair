import React, { useEffect, useRef, useState, useCallback } from "react";
import type {
  AnnotationPoint,
  AnnotationStroke,
  ControlMessage,
  GuestCursorIndicator,
  HostOverlayState,
  ImeModeEvent,
  InputEvent as PairPairInputEvent,
  KeyboardDownEvent,
  KeyboardUpEvent,
  QualityPreset,
  QualityPresetName,
} from "@pairpair/shared";
import { QUALITY_PRESETS, calcBitrateMbps } from "@pairpair/shared";
import { useAppStore } from "../store/app-store";
import { useSessionStore } from "../store/session-store";
import { useSettingsStore } from "../store/settings-store";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { StatsOverlay } from "../components/StatsOverlay";
import { PermissionPanel } from "../components/PermissionPanel";
import { RemoteVideoView } from "../components/RemoteVideoView";
import { MarkerToolbar } from "../components/MarkerToolbar";
import { QualityPresetSelector } from "../components/QualityPresetSelector";
import { ScreenSourcePicker } from "../components/ScreenSourcePicker";
import {
  closePeerConnection,
  applyQualityPreset,
  setAdaptiveParameters,
  getPeerConnection,
  getLocalStreamResolution,
  switchScreenSource,
} from "../webrtc/rtc-client";
import { signalingClient } from "../webrtc/signaling-client";
import { startStatsMonitor, stopStatsMonitor, type WebRTCStats } from "../webrtc/stats-monitor";
import { startMetricsCollection, startSharpnessAnalysis } from "../utils/quality-metrics";
import { dataChannelManager } from "../webrtc/data-channel";
import { adaptiveQualityController } from "../webrtc/adaptive-quality";

const CURSOR_HIDE_DELAY_MS = 3000;
const FULLSCREEN_ESCAPE_INTERVAL_MS = 450;
const FULLSCREEN_HINT_DURATION_MS = 5000;

function getImeModeEvent(event: KeyboardEvent): ImeModeEvent | null {
  if (event.code === "Lang1") return { type: "ime.mode", mode: "japanese" };
  if (event.code === "Lang2") return { type: "ime.mode", mode: "latin" };

  const toggleKeys = new Set([
    "KanjiMode",
    "Hankaku",
    "Zenkaku",
    "ZenkakuHankaku",
    "KanaMode",
  ]);
  if (toggleKeys.has(event.key)) {
    return { type: "ime.mode", mode: "toggle" };
  }

  return null;
}

export function SessionPage(): React.ReactElement {
  const { navigate } = useAppStore();
  const {
    role,
    hostDeviceName,
    guestDeviceName,
    connectionState,
    controlState,
    currentQualityPreset,
    customQualityPreset,
    adaptiveModeActive,
    adaptiveBasePreset,
  } = useSessionStore();
  const { pairproProfiles, wheelDirection, saveToElectron } = useSettingsStore();

  const [stats, setStats] = useState<WebRTCStats>({});
  const [showStats, setShowStats] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<QualityPresetName>(currentQualityPreset);
  const [customPreset, setCustomPreset] = useState<Partial<QualityPreset>>(customQualityPreset);
  const [adaptiveMode, setAdaptiveMode] = useState(adaptiveModeActive);
  const [adaptiveState, setAdaptiveState] = useState(adaptiveQualityController.state);
  const [adaptiveResPreset, setAdaptiveResPreset] = useState<Exclude<QualityPresetName, "Custom">>(
    (adaptiveBasePreset !== "Custom" ? adaptiveBasePreset : "Balanced") as Exclude<QualityPresetName, "Custom">,
  );
  const [showScreenPicker, setShowScreenPicker] = useState(false);
  const [annotations, setAnnotations] = useState<AnnotationStroke[]>([]);
  const [markerEnabled, setMarkerEnabled] = useState(false);
  const [markerColor, setMarkerColor] = useState("#ff6b6b");
  const [markerWidth, setMarkerWidth] = useState(4);
  const [remoteCursor, setRemoteCursor] = useState<GuestCursorIndicator | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenHintVisible, setFullscreenHintVisible] = useState(false);
  const [displayMode, setDisplayMode] = useState<"fit" | "native">("fit");

  const adaptiveInputHandlerRef = useRef<((e: PairPairInputEvent) => void) | null>(null);
  const hasAutoEnabledRef = useRef(false);
  const metricsStopRef = useRef<(() => void) | null>(null);
  const sharpnessStopRef = useRef<(() => void) | null>(null);
  const controlMessageHandlerRef = useRef<((message: ControlMessage) => void) | null>(null);
  const hoverHideTimerRef = useRef<number | null>(null);
  const fullscreenHintTimerRef = useRef<number | null>(null);
  const lastEscapeAtRef = useRef(0);
  const activeStrokeRef = useRef<string | null>(null);
  const annotationsRef = useRef<AnnotationStroke[]>([]);
  const remoteCursorRef = useRef<GuestCursorIndicator | null>(null);
  const isHost = role === "host";

  const STATE_LABEL: Record<string, string> = {
    idle: "アイドル",
    mouse_moving: "マウス移動",
    scrolling: "スクロール",
    typing: "タイプ中",
    clicking: "クリック",
  };

  const syncHostOverlay = useCallback(
    (nextStrokes: AnnotationStroke[], nextCursor: GuestCursorIndicator | null) => {
      if (!isHost) return;
      const state: HostOverlayState = { strokes: nextStrokes, guestCursor: nextCursor };
      void window.pairpair.updateHostOverlay(state).catch(console.error);
    },
    [isHost],
  );

  const setCursorWithTimeout = useCallback(
    (cursor: GuestCursorIndicator | null) => {
      if (hoverHideTimerRef.current !== null) {
        window.clearTimeout(hoverHideTimerRef.current);
        hoverHideTimerRef.current = null;
      }

      setRemoteCursor(cursor);
      syncHostOverlay(annotationsRef.current, cursor);

      if (cursor?.visible) {
        hoverHideTimerRef.current = window.setTimeout(() => {
          setRemoteCursor(null);
          remoteCursorRef.current = null;
          syncHostOverlay(annotationsRef.current, null);
        }, CURSOR_HIDE_DELAY_MS);
      }
    },
    [syncHostOverlay],
  );

  const enableAdaptive = useCallback((resPreset?: Exclude<QualityPresetName, "Custom">) => {
    const basePresetName = resPreset ?? adaptiveResPreset;
    useSessionStore.getState().setAdaptiveBasePreset(basePresetName);

    const actual = getLocalStreamResolution();
    adaptiveQualityController.enable(
      pairproProfiles,
      (fps, bitrateMbps) => {
        void setAdaptiveParameters(fps, bitrateMbps);
      },
      actual?.width ?? QUALITY_PRESETS[basePresetName].width,
      actual?.height ?? QUALITY_PRESETS[basePresetName].height,
    );
    useSessionStore.getState().setAdaptiveModeActive(true);
    setAdaptiveMode(true);
  }, [adaptiveResPreset, pairproProfiles]);

  const disableAdaptive = useCallback(() => {
    adaptiveQualityController.disable();
    const preset = selectedPreset === "Custom"
      ? ({ ...customPreset, name: "Custom" } as QualityPreset)
      : QUALITY_PRESETS[selectedPreset as Exclude<QualityPresetName, "Custom">];
    void applyQualityPreset(preset).catch(console.warn);
    useSessionStore.getState().setAdaptiveModeActive(false);
    setAdaptiveMode(false);
  }, [customPreset, selectedPreset]);

  const finalizeSession = useCallback(() => {
    signalingClient.disconnect();
    closePeerConnection();
    void window.pairpair.hideHostOverlay().catch(console.error);
    void window.pairpair.setGuestFullscreen(false).catch(() => undefined);
    useSessionStore.getState().reset();
    navigate("home");
  }, [navigate]);

  const handleDisconnect = useCallback(() => {
    signalingClient.send({ type: "session.close", payload: { reason: isHost ? "host_closed" : "guest_disconnected" } });
    finalizeSession();
  }, [finalizeSession, isHost]);

  const handleGuestDisconnected = useCallback(() => {
    if (hoverHideTimerRef.current !== null) {
      window.clearTimeout(hoverHideTimerRef.current);
      hoverHideTimerRef.current = null;
    }

    activeStrokeRef.current = null;
    annotationsRef.current = [];
    remoteCursorRef.current = null;

    setAnnotations([]);
    setRemoteCursor(null);
    setMarkerEnabled(false);

    syncHostOverlay([], null);

    useSessionStore.getState().setControlState("viewOnly");
    useSessionStore.getState().setConnectionState("disconnected");
    useSessionStore.getState().setGuestDeviceName(null);
    finalizeSession();
  }, [finalizeSession, syncHostOverlay]);

  const handleReturnControlToHost = useCallback(() => {
    if (!isHost) return;
    if (useSessionStore.getState().controlState !== "controlAllowed") return;

    useSessionStore.getState().setControlState("controlRevoked");
    dataChannelManager.sendControl({ type: "remoteControl.revoked" });
  }, [isHost]);

  const upsertStrokePoint = useCallback((strokeId: string, point: AnnotationPoint) => {
    setAnnotations((prev) => {
      const next = prev.map((stroke) => {
        if (stroke.id !== strokeId) return stroke;
        const lastPoint = stroke.points[stroke.points.length - 1];
        if (lastPoint && Math.abs(lastPoint.x - point.x) < 0.001 && Math.abs(lastPoint.y - point.y) < 0.001) {
          return stroke;
        }
        return { ...stroke, points: [...stroke.points, point] };
      });
      syncHostOverlay(next, remoteCursorRef.current);
      return next;
    });
  }, [syncHostOverlay]);

  const beginMarkerStroke = useCallback((point: AnnotationPoint) => {
    const strokeId = crypto.randomUUID();
    activeStrokeRef.current = strokeId;
    const stroke: AnnotationStroke = {
      id: strokeId,
      color: markerColor,
      width: markerWidth,
      points: [point],
      createdAt: Date.now(),
    };

    setAnnotations((prev) => {
      const next = [...prev, stroke];
      return next;
    });
    dataChannelManager.sendControl({
      type: "annotation.stroke.begin",
      stroke: {
        id: stroke.id,
        color: stroke.color,
        width: stroke.width,
        createdAt: stroke.createdAt,
      },
      point,
    });
  }, [markerColor, markerWidth]);

  const appendMarkerStroke = useCallback((point: AnnotationPoint) => {
    const strokeId = activeStrokeRef.current;
    if (!strokeId) return;
    upsertStrokePoint(strokeId, point);
    dataChannelManager.sendControl({ type: "annotation.stroke.append", strokeId, point });
  }, [upsertStrokePoint]);

  const endMarkerStroke = useCallback(() => {
    if (!activeStrokeRef.current) return;
    dataChannelManager.sendControl({ type: "annotation.stroke.end", strokeId: activeStrokeRef.current });
    activeStrokeRef.current = null;
  }, []);

  const handleUndoAnnotation = useCallback(() => {
    setAnnotations((prev) => {
      const next = prev.slice(0, -1);
      syncHostOverlay(next, remoteCursorRef.current);
      return next;
    });
    dataChannelManager.sendControl({ type: "annotation.undo" });
  }, [syncHostOverlay]);

  const handleClearAnnotations = useCallback(() => {
    setAnnotations([]);
    syncHostOverlay([], remoteCursorRef.current);
    dataChannelManager.sendControl({ type: "annotation.clear" });
  }, [syncHostOverlay]);

  const handleHoverPreview = useCallback((point: AnnotationPoint | null) => {
    if (controlState === "controlAllowed") return;
    if (!point) {
      const hidden: GuestCursorIndicator = {
        x: remoteCursorRef.current?.x ?? 0,
        y: remoteCursorRef.current?.y ?? 0,
        visible: false,
        timestamp: Date.now(),
      };
      dataChannelManager.sendControl({ type: "guest.cursor", cursor: hidden });
      return;
    }

    const cursor: GuestCursorIndicator = {
      x: point.x,
      y: point.y,
      visible: true,
      timestamp: Date.now(),
    };
    dataChannelManager.sendControl({ type: "guest.cursor", cursor });
  }, [controlState]);

  const enterFullscreen = useCallback(() => {
    void window.pairpair.setGuestFullscreen(true).catch(console.error);
  }, []);

  useEffect(() => {
    startStatsMonitor(setStats);
    void window.pairpair.registerShortcuts(isHost).catch(console.error);
    if (isHost) {
      void window.pairpair.showHostOverlay().catch(console.error);
    }

    window.pairpair.onShortcut((action) => {
      if (action === "pause") {
        useSessionStore.getState().setControlState("controlPaused");
        dataChannelManager.sendControl({ type: "remoteControl.paused" });
      } else if (action === "revoke") {
        handleReturnControlToHost();
      } else if (action === "end") {
        handleDisconnect();
      }
    });

    return () => {
      stopStatsMonitor();
      void window.pairpair.unregisterShortcuts().catch(console.error);
      void window.pairpair.hideHostOverlay().catch(console.error);
      void window.pairpair.setGuestFullscreen(false).catch(() => undefined);
      window.pairpair.removeShortcutListener();
      adaptiveQualityController.disable();
      if (adaptiveInputHandlerRef.current) {
        dataChannelManager.offInput(adaptiveInputHandlerRef.current);
        adaptiveInputHandlerRef.current = null;
      }
      if (hoverHideTimerRef.current !== null) {
        window.clearTimeout(hoverHideTimerRef.current);
      }
      if (fullscreenHintTimerRef.current !== null) {
        window.clearTimeout(fullscreenHintTimerRef.current);
      }
    };
  }, [handleDisconnect, handleReturnControlToHost, isHost]);

  useEffect(() => {
    const handleFullscreenChanged = (nextFullscreen: boolean) => {
      setFullscreen(nextFullscreen);

      if (fullscreenHintTimerRef.current !== null) {
        window.clearTimeout(fullscreenHintTimerRef.current);
        fullscreenHintTimerRef.current = null;
      }

      if (nextFullscreen) {
        setFullscreenHintVisible(true);
        fullscreenHintTimerRef.current = window.setTimeout(() => {
          setFullscreenHintVisible(false);
          fullscreenHintTimerRef.current = null;
        }, FULLSCREEN_HINT_DURATION_MS);
      } else {
        setFullscreenHintVisible(false);
      }
    };

    window.pairpair.onFullscreenChanged(handleFullscreenChanged);
    return () => {
      window.pairpair.removeFullscreenChangedListener();
      if (fullscreenHintTimerRef.current !== null) {
        window.clearTimeout(fullscreenHintTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isHost && adaptiveModeActive && !hasAutoEnabledRef.current) {
      hasAutoEnabledRef.current = true;
      enableAdaptive();
    }
  }, [adaptiveModeActive, enableAdaptive, isHost]);

  useEffect(() => {
    if (!isHost) return;
    if (!adaptiveMode && controlState !== "controlAllowed") return;

    void window.pairpair.startActivityMonitor();
    window.pairpair.onSystemActivity(() => {
      if (controlState === "controlAllowed") {
        handleReturnControlToHost();
      }
      if (adaptiveMode) {
        adaptiveQualityController.notifyActivity("mouse_moving");
      }
    });

    return () => {
      window.pairpair.removeSystemActivityListener();
      void window.pairpair.stopActivityMonitor();
    };
  }, [adaptiveMode, controlState, handleReturnControlToHost, isHost]);

  useEffect(() => {
    if (!isHost) return;
    if (!adaptiveMode) return;

    const handler = (event: PairPairInputEvent) => adaptiveQualityController.onInputEvent(event);
    adaptiveInputHandlerRef.current = handler;
    dataChannelManager.onInput(handler);

    return () => {
      if (adaptiveInputHandlerRef.current) {
        dataChannelManager.offInput(adaptiveInputHandlerRef.current);
        adaptiveInputHandlerRef.current = null;
      }
    };
  }, [isHost, adaptiveMode]);

  useEffect(() => {
    if (isHost) return;
    const pc = getPeerConnection();
    if (!pc) return;

    metricsStopRef.current = startMetricsCollection(pc, 5000);
    const videoEl = document.querySelector("video[data-remote]") as HTMLVideoElement | null;
    if (videoEl) {
      sharpnessStopRef.current = startSharpnessAnalysis(videoEl, 10000);
    }

    return () => {
      metricsStopRef.current?.();
      metricsStopRef.current = null;
      sharpnessStopRef.current?.();
      sharpnessStopRef.current = null;
    };
  }, [isHost]);

  useEffect(() => {
    if (!adaptiveMode) return;
    const timer = window.setInterval(() => setAdaptiveState(adaptiveQualityController.state), 500);
    return () => window.clearInterval(timer);
  }, [adaptiveMode]);

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  useEffect(() => {
    remoteCursorRef.current = remoteCursor;
  }, [remoteCursor]);

  useEffect(() => {
    if (isHost || controlState !== "controlAllowed") return;
    const hidden: GuestCursorIndicator = {
      x: remoteCursorRef.current?.x ?? 0,
      y: remoteCursorRef.current?.y ?? 0,
      visible: false,
      timestamp: Date.now(),
    };
    dataChannelManager.sendControl({ type: "guest.cursor", cursor: hidden });
  }, [controlState, isHost]);

  useEffect(() => {
    const handler = (message: ControlMessage) => {
      switch (message.type) {
        case "annotation.stroke.begin": {
          if (!isHost) return;
          const stroke: AnnotationStroke = {
            ...message.stroke,
            points: [message.point],
          };
          setAnnotations((prev) => {
            const next = [...prev.filter((entry) => entry.id !== stroke.id), stroke];
            syncHostOverlay(next, remoteCursorRef.current);
            return next;
          });
          break;
        }
        case "annotation.stroke.append": {
          if (!isHost) return;
          upsertStrokePoint(message.strokeId, message.point);
          break;
        }
        case "annotation.undo": {
          if (!isHost) return;
          setAnnotations((prev) => {
            const next = prev.slice(0, -1);
            syncHostOverlay(next, remoteCursorRef.current);
            return next;
          });
          break;
        }
        case "annotation.clear": {
          if (!isHost) return;
          setAnnotations(() => {
            syncHostOverlay([], remoteCursorRef.current);
            return [];
          });
          break;
        }
        case "guest.cursor": {
          if (!isHost) return;
          if (!message.cursor.visible) {
            setCursorWithTimeout(null);
          } else {
            setCursorWithTimeout(message.cursor);
          }
          break;
        }
      }
    };

    controlMessageHandlerRef.current = handler;
    dataChannelManager.onControl(handler);
    return () => {
      if (controlMessageHandlerRef.current) {
        dataChannelManager.offControl(controlMessageHandlerRef.current);
      }
    };
  }, [isHost, setCursorWithTimeout, syncHostOverlay, upsertStrokePoint]);

  useEffect(() => {
    if (!isHost) return;
    syncHostOverlay(annotations, remoteCursor);
  }, [annotations, isHost, remoteCursor, syncHostOverlay]);

  useEffect(() => {
    const handleSessionClose = (message: Record<string, unknown>) => {
      const payload = message.payload as { reason?: string } | undefined;
      if (!isHost || payload?.reason !== "guest_disconnected") return;
      handleGuestDisconnected();
    };

    signalingClient.on("session.close", handleSessionClose);
    return () => {
      signalingClient.off("session.close", handleSessionClose);
    };
  }, [handleGuestDisconnected, isHost]);

  useEffect(() => {
    if (isHost) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && markerEnabled) {
        const now = Date.now();
        if (now - lastEscapeAtRef.current <= FULLSCREEN_ESCAPE_INTERVAL_MS) {
          e.preventDefault();
          e.stopPropagation();
          lastEscapeAtRef.current = 0;
          setMarkerEnabled(false);
          return;
        }

        handleClearAnnotations();
        lastEscapeAtRef.current = now;
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (fullscreen && e.key === "Escape") {
        const now = Date.now();
        if (now - lastEscapeAtRef.current <= FULLSCREEN_ESCAPE_INTERVAL_MS) {
          e.preventDefault();
          e.stopPropagation();
          lastEscapeAtRef.current = 0;
          void window.pairpair.setGuestFullscreen(false).catch(console.error);
          return;
        }

        lastEscapeAtRef.current = now;
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (controlState !== "controlAllowed") return;
      e.preventDefault();
      const imeEvent = getImeModeEvent(e);
      if (imeEvent) {
        if (!e.repeat) {
          if (adaptiveMode) {
            adaptiveQualityController.onInputEvent(imeEvent);
          }
          dataChannelManager.sendInput(imeEvent);
        }
        return;
      }
      const event: KeyboardDownEvent = {
        type: "keyboard.down",
        code: e.code,
        key: e.key,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      };
      if (adaptiveMode) {
        adaptiveQualityController.onInputEvent(event);
      }
      dataChannelManager.sendInput(event);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (fullscreen || markerEnabled)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (controlState !== "controlAllowed") return;
      e.preventDefault();
      if (getImeModeEvent(e)) return;
      const event: KeyboardUpEvent = {
        type: "keyboard.up",
        code: e.code,
        key: e.key,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      };
      if (adaptiveMode) {
        adaptiveQualityController.onInputEvent(event);
      }
      dataChannelManager.sendInput(event);
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    document.addEventListener("keyup", handleKeyUp, { capture: true });

    return () => {
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
      document.removeEventListener("keyup", handleKeyUp, { capture: true });
    };
  }, [controlState, fullscreen, handleClearAnnotations, isHost, markerEnabled]);

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
          <span style={{ color: "#aaa", fontSize: 12 }}>
            注釈: {annotations.length}本 / カーソル: {remoteCursor?.visible ? "表示中" : "非表示"}
          </span>
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
          <div style={{ color: "#aaa", marginBottom: 8 }}>共有画面上に透明オーバーレイを表示中</div>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 24 }}>
            ゲストのマーカーと非操作時カーソルは共有ディスプレイ上に投影されます。
          </div>

          <div style={{ width: "100%", maxWidth: 800, marginBottom: 24 }}>
            <h4 style={{ color: "#aaa", marginBottom: 12 }}>画質設定</h4>
            <div style={{ display: "flex", gap: 0, marginBottom: 12, borderRadius: 6, overflow: "hidden", border: "1px solid #444" }}>
              {[
                { key: false, label: "従来のプリセット" },
                { key: true, label: "適応モード（PairPro）" },
              ].map(({ key, label }) => (
                <button
                  key={String(key)}
                  onClick={() => (key ? enableAdaptive() : disableAdaptive())}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    background: adaptiveMode === key ? "#4a9eff" : "#1a1a2e",
                    color: adaptiveMode === key ? "#fff" : "#888",
                    border: "none",
                    fontSize: 13,
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
              <div style={{ background: "#1a1a2e", border: "1px solid #2a2a4e", borderRadius: 6, padding: "12px 16px", fontSize: 12, maxHeight: 600, overflowY: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ color: "#888" }}>解像度:</span>
                  <select
                    value={adaptiveResPreset}
                    onChange={(e) => {
                      const preset = e.target.value as Exclude<QualityPresetName, "Custom">;
                      setAdaptiveResPreset(preset);
                      const basePreset = QUALITY_PRESETS[preset];
                      void applyQualityPreset(basePreset).then(() => {
                        adaptiveQualityController.setResolution(basePreset.width, basePreset.height);
                      });
                      useSessionStore.getState().setAdaptiveBasePreset(preset);
                    }}
                    style={{ background: "#2a2a3e", color: "#fff", border: "1px solid #444", padding: "4px 8px", borderRadius: 4, fontSize: 12 }}
                  >
                    {(["Low", "Balanced", "Sharp", "Ultra"] as const).map((preset) => (
                      <option key={preset} value={preset}>
                        {preset} ({QUALITY_PRESETS[preset].resolution})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ color: "#4a9eff", marginBottom: 12, fontWeight: "bold" }}>
                  状態: {STATE_LABEL[adaptiveState]} - {adaptiveQualityController.getProfile(adaptiveState)?.fps ?? 0} fps /{" "}
                  {adaptiveQualityController.getProfile(adaptiveState)
                    ? calcBitrateMbps(
                        adaptiveQualityController.getProfile(adaptiveState)!.quality,
                        QUALITY_PRESETS[adaptiveResPreset].width,
                        QUALITY_PRESETS[adaptiveResPreset].height,
                        adaptiveQualityController.getProfile(adaptiveState)!.fps,
                      )
                    : 0}{" "}
                  Mbps
                </div>

                {/* Table header */}
                <div style={{ display: "flex", gap: 12, marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #2a2a4e" }}>
                  <div style={{ flex: "0 0 120px", color: "#888", fontSize: 11, fontWeight: "bold" }}>状態</div>
                  <div style={{ flex: "0 0 80px", color: "#888", fontSize: 11, fontWeight: "bold" }}>FPS</div>
                  <div style={{ flex: 1, color: "#888", fontSize: 11, fontWeight: "bold" }}>品質（スライダー）</div>
                  <div style={{ flex: "0 0 100px", color: "#888", fontSize: 11, fontWeight: "bold" }}>目安 Mbps</div>
                  <div style={{ flex: "0 0 120px", color: "#888", fontSize: 11, fontWeight: "bold" }}>アイドル時間</div>
                </div>

                {/* Rows for each state */}
                {(["idle", "mouse_moving", "scrolling", "typing", "clicking"] as const).map((state) => {
                  const profile = adaptiveQualityController.getProfile(state);
                  if (!profile) return null;
                  return (
                    <div key={state} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #333" }}>
                      {/* State label */}
                      <div style={{ flex: "0 0 120px", color: "#aaa", fontSize: 11 }}>{STATE_LABEL[state]}</div>

                      {/* FPS input */}
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={profile.fps}
                        onChange={(e) => {
                          const newFps = Math.max(1, Math.min(60, parseInt(e.target.value, 10) || profile.fps));
                          const updated = { ...profile, fps: newFps };
                          adaptiveQualityController.updateProfile(state, updated);
                          setAdaptiveState(adaptiveQualityController.state);
                        }}
                        style={{
                          flex: "0 0 80px",
                          padding: "4px 8px",
                          background: "#2a2a3e",
                          color: "#fff",
                          border: "1px solid #444",
                          borderRadius: 4,
                          fontSize: 11,
                        }}
                      />

                      {/* Quality slider */}
                      <div style={{ flex: 1, display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          step="1"
                          value={profile.quality}
                          onChange={(e) => {
                            const newQuality = parseInt(e.target.value, 10);
                            const updated = { ...profile, quality: newQuality };
                            adaptiveQualityController.updateProfile(state, updated);
                            setAdaptiveState(adaptiveQualityController.state);
                          }}
                          style={{ flex: 1, accentColor: "#4a9eff", cursor: "pointer" }}
                        />
                        <span style={{ color: "#4a9eff", fontWeight: "bold", fontSize: 11, minWidth: "30px" }}>
                          {profile.quality}%
                        </span>
                      </div>

                      {/* Bitrate estimate */}
                      <div style={{ flex: "0 0 100px", color: "#666", fontSize: 11, textAlign: "center" }}>
                        {calcBitrateMbps(
                          profile.quality,
                          QUALITY_PRESETS[adaptiveResPreset].width,
                          QUALITY_PRESETS[adaptiveResPreset].height,
                          profile.fps,
                        ).toFixed(1)} Mbps
                      </div>

                      {/* Idle timeout input */}
                      <input
                        type="number"
                        min="500"
                        max="15000"
                        step="500"
                        value={profile.idleTimeoutMs}
                        onChange={(e) => {
                          const newTimeout = Math.max(500, Math.min(15000, parseInt(e.target.value, 10) || profile.idleTimeoutMs));
                          const updated = { ...profile, idleTimeoutMs: newTimeout };
                          adaptiveQualityController.updateProfile(state, updated);
                          setAdaptiveState(adaptiveQualityController.state);
                        }}
                        style={{
                          flex: "0 0 120px",
                          padding: "4px 8px",
                          background: "#2a2a3e",
                          color: "#fff",
                          border: "1px solid #444",
                          borderRadius: 4,
                          fontSize: 11,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => setShowScreenPicker(!showScreenPicker)}
              style={{
                padding: "10px 24px",
                background: "#4a9eff",
                color: "#fff",
                border: "none",
                borderRadius: 8,
              }}
            >
              共有の切り替え
            </button>
            <button
              onClick={handleDisconnect}
              style={{ padding: "10px 24px", background: "#ff4444", color: "#fff", border: "none", borderRadius: 8 }}
            >
              セッション終了
            </button>
          </div>
        </div>

        {showScreenPicker && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.75)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 999,
            }}
            onClick={() => setShowScreenPicker(false)}
          >
            <div
              style={{
                background: "#16213e",
                border: "1px solid #333",
                borderRadius: 8,
                padding: 24,
                maxWidth: 900,
                maxHeight: "80vh",
                overflow: "auto",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ color: "#fff", marginBottom: 20, fontSize: 18 }}>共有する画面やアプリを選択</h3>
              <ScreenSourcePicker
                onSelect={(source) => {
                  void switchScreenSource(source.id).then(() => {
                    setShowScreenPicker(false);
                  }).catch(console.error);
                }}
              />
              <button
                onClick={() => setShowScreenPicker(false)}
                style={{
                  padding: "8px 16px",
                  background: "#444",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  marginTop: 16,
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        <PermissionPanel role="host" />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#000",
        position: "relative",
      }}
    >
      {!fullscreen && (
        <div
          style={{
            padding: "8px 16px",
            background: "#16213e",
            borderBottom: "1px solid #333",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontWeight: "bold", color: "#4a9eff" }}>PairPair - ゲスト</span>
          <ConnectionStatus />
          <span style={{ color: "#aaa", fontSize: 13 }}>{hostDeviceName ?? "Host"}</span>
          <StatsOverlay stats={stats} visible={showStats} onToggle={() => setShowStats(!showStats)} />
          <MarkerToolbar
            enabled={markerEnabled}
            color={markerColor}
            width={markerWidth}
            displayMode={displayMode}
            wheelDirection={wheelDirection}
            onToggle={() => setMarkerEnabled((prev) => !prev)}
            onEnable={() => setMarkerEnabled(true)}
            onDisplayModeChange={setDisplayMode}
            onWheelDirectionChange={(direction) => {
              void saveToElectron("wheelDirection", direction);
            }}
            onColorChange={setMarkerColor}
            onWidthChange={setMarkerWidth}
            onUndo={handleUndoAnnotation}
            onClear={handleClearAnnotations}
            canUndo={annotations.length > 0}
            hasStrokes={annotations.length > 0}
            onEnterFullscreen={enterFullscreen}
          />
          <button
            onClick={handleDisconnect}
            style={{
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
      )}

      <RemoteVideoView
        annotations={annotations}
        remoteCursor={null}
        markerEnabled={markerEnabled}
        onMarkerStart={beginMarkerStroke}
        onMarkerMove={appendMarkerStroke}
        onMarkerEnd={endMarkerStroke}
        onHoverPreview={handleHoverPreview}
        fullscreen={fullscreen}
        displayMode={displayMode}
        wheelDirection={wheelDirection}
        adaptiveMode={adaptiveMode}
      />

      {fullscreen && fullscreenHintVisible && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            padding: "14px 20px",
            borderRadius: 12,
            background: "rgba(0, 0, 0, 0.74)",
            color: "#fff",
            fontSize: 36,
            fontWeight: 700,
            pointerEvents: "none",
            boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
          }}
        >
          ESC を素早く 2 回で全画面を終了
        </div>
      )}

      {!fullscreen && <PermissionPanel role="guest" />}
    </div>
  );
}
