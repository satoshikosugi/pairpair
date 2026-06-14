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
  SpotlightIndicator,
  TextInputEvent,
} from "@pairpair/shared";
import { QUALITY_PRESETS, calcBitrateMbps, hasInteractiveControl } from "@pairpair/shared";
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
  createPeerConnectionAsGuest,
  createPeerConnectionAsHost,
  getLocalStreamResolution,
  handleAnswer,
  handleIce,
  handleOffer,
  markPeerAuthenticated,
  startHostScreenShare,
  getPeerConnection,
  switchScreenSource,
} from "../webrtc/rtc-client";
import { signalingClient } from "../webrtc/signaling-client";
import { startStatsMonitor, stopStatsMonitor, type WebRTCStats } from "../webrtc/stats-monitor";
import { startMetricsCollection, startSharpnessAnalysis } from "../utils/quality-metrics";
import { dataChannelManager } from "../webrtc/data-channel";
import { adaptiveQualityController } from "../webrtc/adaptive-quality";
import { guestPeerAuthenticator, hostPeerAuthenticator } from "../webrtc/peer-auth";
import { normalizeNickname } from "../display-name";

const CURSOR_HIDE_DELAY_MS = 3000;
const FULLSCREEN_ESCAPE_INTERVAL_MS = 450;
const FULLSCREEN_HINT_DURATION_MS = 5000;
const TOOLBAR_IDLE_FADE_MS = 5000;
const FULLSCREEN_REQUEST_TIMEOUT_MS = 1500;
const ROLE_SWITCH_READY_RETRY_MS = 250;
const ROLE_SWITCH_READY_MAX_RETRIES = 24;
const ROLE_SWITCH_COMPLETION_TIMEOUT_MS = 15000;
const SPOTLIGHT_DURATION_MS = 3000;

function getToolboxBounds(
  panelWidth: number,
  panelHeight: number,
  fullscreen: boolean,
  displayMode: "fit" | "native",
): { minX: number; maxX: number; minY: number; maxY: number } {
  const fallbackMinY = fullscreen ? 12 : 64;
  const fallback = {
    minX: 12,
    maxX: Math.max(12, window.innerWidth - panelWidth - 12),
    minY: fallbackMinY,
    maxY: Math.max(fallbackMinY, window.innerHeight - panelHeight - 12),
  };

  if (!fullscreen || displayMode !== "fit") {
    return fallback;
  }

  const video = document.getElementById("remote-video");
  if (!(video instanceof HTMLVideoElement)) {
    return fallback;
  }

  const rect = video.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return fallback;
  }

  return {
    minX: Math.max(12, rect.left + 8),
    maxX: Math.max(Math.max(12, rect.left + 8), rect.right - panelWidth - 8),
    minY: Math.max(12, rect.top + 8),
    maxY: Math.max(Math.max(12, rect.top + 8), rect.bottom - panelHeight - 8),
  };
}

/**
 * 明示的な "japanese"/"latin" のみ返す。トグルキー（半角/全角など）は null を返す。
 * トグルキーはコンポーネント内でローカル状態を参照して処理する。
 */
function getImeModeEvent(event: KeyboardEvent): ImeModeEvent | null {
  // code ベースの検出（モダンな Chromium/Electron、macOS JIS キーボード）
  if (event.code === "Lang1") return { type: "ime.mode", mode: "japanese" };
  if (event.code === "Lang2") return { type: "ime.mode", mode: "latin" };

  // key ベースの検出（古い Electron/Chromium で code が異なる場合のフォールバック）
  // "Eisu" = 英数キー（macOS JIS キーボードで code が "CapsLock" になる場合がある）
  if (event.key === "Eisu") return { type: "ime.mode", mode: "latin" };
  // "KanaMode" = かなキー（常に日本語モード有効化）
  if (event.key === "KanaMode") return { type: "ime.mode", mode: "japanese" };

  // トグルキー（半角/全角など）は null を返す。呼び出し元でローカル状態を使って処理する。
  return null;
}

/** 半角/全角など、IME を toggle する DOM key 名 */
const IME_TOGGLE_KEY_NAMES = new Set(["KanjiMode", "Hankaku", "Zenkaku", "ZenkakuHankaku"]);

export function SessionPage(): React.ReactElement {
  const { navigate, setError } = useAppStore();
  const {
    sessionId,
    code,
    role,
    hostDeviceName,
    guestDeviceName,
    signalingUrl,
    hostToken,
    guestToken,
    connectionState,
    controlState,
    permissionPresetId,
    currentQualityPreset,
    customQualityPreset,
    adaptiveModeActive,
    adaptiveBasePreset,
    sessionPermissions,
    clipboardHistory,
  } = useSessionStore();
  const { pairproProfiles, wheelDirection, saveToElectron, lastSourceName, lastSourceDisplayId, recentSession, setRecentSession, nickname } = useSettingsStore();
  const localNickname = normalizeNickname(nickname);
  const remoteGuestName = normalizeNickname(guestDeviceName);
  const remoteHostName = normalizeNickname(hostDeviceName);

  const [stats, setStats] = useState<WebRTCStats>({});
  const [showStats, setShowStats] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<QualityPresetName>(currentQualityPreset);
  const [customPreset, setCustomPreset] = useState<Partial<QualityPreset>>(customQualityPreset);
  const [adaptiveMode, setAdaptiveMode] = useState(adaptiveModeActive || adaptiveQualityController.enabled);
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
  const [spotlight, setSpotlight] = useState<SpotlightIndicator | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenHintVisible, setFullscreenHintVisible] = useState(false);
  const [displayMode, setDisplayMode] = useState<"fit" | "native">("fit");
  const [toolboxMinimized, setToolboxMinimized] = useState(false);
  const [toolboxPosition, setToolboxPosition] = useState({ x: 16, y: 76 });
  const [toolboxDimmed, setToolboxDimmed] = useState(false);
  const [showRoleSwitchPicker, setShowRoleSwitchPicker] = useState(false);
  const [roleSwitchInProgress, setRoleSwitchInProgress] = useState(false);

  const adaptiveInputHandlerRef = useRef<((e: PairPairInputEvent) => void) | null>(null);
  const metricsStopRef = useRef<(() => void) | null>(null);
  const sharpnessStopRef = useRef<(() => void) | null>(null);
  const controlMessageHandlerRef = useRef<((message: ControlMessage) => void) | null>(null);
  const hoverHideTimerRef = useRef<number | null>(null);
  const fullscreenHintTimerRef = useRef<number | null>(null);
  const toolboxIdleTimerRef = useRef<number | null>(null);
  const lastEscapeAtRef = useRef(0);
  const activeStrokeRef = useRef<string | null>(null);
  const annotationsRef = useRef<AnnotationStroke[]>([]);
  const remoteCursorRef = useRef<GuestCursorIndicator | null>(null);
  const spotlightRef = useRef<SpotlightIndicator | null>(null);
  const toolboxDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const toolboxElementRef = useRef<HTMLDivElement | null>(null);
  const pendingRoleSwitchSourceRef = useRef<ScreenSource | null>(null);
  const roleSwitchTimeoutRef = useRef<number | null>(null);
  // ゲストが IME 切り替えトグルキーを押した際のローカル状態追跡
  // "toggle" を送らず常に明示的な "japanese"/"latin" を送るために使用
  const guestImeModeRef = useRef<"japanese" | "latin">("latin");
  const pendingRoleSwitchGuestTokenRef = useRef<string | null>(null);
  const roleSwitchReadyRetryTimerRef = useRef<number | null>(null);
  const roleSwitchCompletionTimerRef = useRef<number | null>(null);
  const isHost = role === "host";
  const isHostRef = useRef(isHost);
  const roleSwitchInProgressRef = useRef(roleSwitchInProgress);
  const fullscreenRef = useRef(fullscreen);
  const fullscreenRequestPendingRef = useRef(false);
  const fullscreenRequestTimerRef = useRef<number | null>(null);
  const spotlightTimerRef = useRef<number | null>(null);

  const STATE_LABEL: Record<string, string> = {
    idle: "アイドル",
    mouse_moving: "マウス移動",
    scrolling: "スクロール",
    typing: "タイプ中",
    clicking: "クリック",
  };

  const getAdaptiveProfile = useCallback(
    (state: keyof typeof STATE_LABEL) => adaptiveQualityController.getProfile(state) ?? pairproProfiles[state],
    [pairproProfiles],
  );

  const syncHostOverlay = useCallback(
    (nextStrokes: AnnotationStroke[], nextCursor: GuestCursorIndicator | null, nextSpotlight: SpotlightIndicator | null = spotlightRef.current) => {
      if (!isHost) return;
      const state: HostOverlayState = { strokes: nextStrokes, guestCursor: nextCursor, spotlight: nextSpotlight };
      void window.pairpair.updateHostOverlay(state).catch(console.error);
    },
    [isHost],
  );

  const setSpotlightWithTimeout = useCallback((nextSpotlight: SpotlightIndicator | null) => {
    if (spotlightTimerRef.current !== null) {
      window.clearTimeout(spotlightTimerRef.current);
      spotlightTimerRef.current = null;
    }

    spotlightRef.current = nextSpotlight;
    setSpotlight(nextSpotlight);
    syncHostOverlay(annotationsRef.current, remoteCursorRef.current, nextSpotlight);

    if (nextSpotlight?.visible) {
      spotlightTimerRef.current = window.setTimeout(() => {
        spotlightRef.current = null;
        setSpotlight(null);
        syncHostOverlay(annotationsRef.current, remoteCursorRef.current, null);
        spotlightTimerRef.current = null;
      }, SPOTLIGHT_DURATION_MS);
    }
  }, [syncHostOverlay]);

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
    setAdaptiveState(adaptiveQualityController.state);
  }, [adaptiveResPreset, pairproProfiles]);

  const disableAdaptive = useCallback(() => {
    adaptiveQualityController.disable();
    const preset = selectedPreset === "Custom"
      ? ({ ...customPreset, name: "Custom" } as QualityPreset)
      : QUALITY_PRESETS[selectedPreset as Exclude<QualityPresetName, "Custom">];
    void applyQualityPreset(preset).catch(console.warn);
    useSessionStore.getState().setAdaptiveModeActive(false);
    setAdaptiveMode(false);
    setAdaptiveState("idle");
  }, [customPreset, selectedPreset]);

  const finalizeSession = useCallback((options?: { clearRecentSession?: boolean }) => {
    if (options?.clearRecentSession) {
      void setRecentSession(null);
    }
    signalingClient.disconnect();
    closePeerConnection();
    void window.pairpair.hideHostOverlay().catch(console.error);
    void window.pairpair.setGuestFullscreen(false).catch(() => undefined);
    useSessionStore.getState().reset();
    navigate("home");
  }, [navigate, setRecentSession]);

  const handleDisconnect = useCallback(() => {
    signalingClient.send({ type: "session.close", payload: { reason: isHost ? "host_closed" : "guest_disconnected" } });
    finalizeSession({ clearRecentSession: !isHost });
  }, [finalizeSession, isHost]);

  const handleGuestDisconnected = useCallback(() => {
    if (hoverHideTimerRef.current !== null) {
      window.clearTimeout(hoverHideTimerRef.current);
      hoverHideTimerRef.current = null;
    }

    activeStrokeRef.current = null;
    annotationsRef.current = [];
    remoteCursorRef.current = null;
    spotlightRef.current = null;

    setAnnotations([]);
    setRemoteCursor(null);
    setSpotlight(null);
    setMarkerEnabled(false);

    syncHostOverlay([], null, null);

    useSessionStore.getState().setControlState("viewOnly");
    useSessionStore.getState().setConnectionState("disconnected");
    useSessionStore.getState().setGuestDeviceName(null);
    finalizeSession();
  }, [finalizeSession, syncHostOverlay]);

  useEffect(() => {
    if (role !== "host" || roleSwitchInProgress) return;
    const nextSnapshot = {
      version: 1,
      role,
      hostDeviceName: role === "host" ? localNickname : remoteHostName,
      guestDeviceName,
      sourceName: lastSourceName,
      sourceDisplayId: lastSourceDisplayId,
      requiresPassphrase: recentSession?.requiresPassphrase ?? false,
      savedAt: Date.now(),
    } as const;

    const unchanged =
      recentSession?.version === nextSnapshot.version &&
      recentSession.role === nextSnapshot.role &&
      recentSession.hostDeviceName === nextSnapshot.hostDeviceName &&
      recentSession.guestDeviceName === nextSnapshot.guestDeviceName &&
      recentSession.sourceName === nextSnapshot.sourceName &&
      recentSession.sourceDisplayId === nextSnapshot.sourceDisplayId &&
      recentSession.requiresPassphrase === nextSnapshot.requiresPassphrase;

    if (unchanged) return;
    void setRecentSession(nextSnapshot);
  }, [
    guestDeviceName,
    hostDeviceName,
    lastSourceDisplayId,
    lastSourceName,
    localNickname,
    remoteHostName,
    role,
    roleSwitchInProgress,
    setRecentSession,
  ]);

  const handleReleaseControl = useCallback(() => {
    if (useSessionStore.getState().controlState !== "controlAllowed") return;

    useSessionStore.getState().setControlState("controlRevoked");
    dataChannelManager.sendControl({ type: "remoteControl.revoked" });
  }, []);

  const clearRoleSwitchTimeout = useCallback(() => {
    if (roleSwitchTimeoutRef.current !== null) {
      window.clearTimeout(roleSwitchTimeoutRef.current);
      roleSwitchTimeoutRef.current = null;
    }
  }, []);

  const clearRoleSwitchReadyRetry = useCallback(() => {
    if (roleSwitchReadyRetryTimerRef.current !== null) {
      window.clearInterval(roleSwitchReadyRetryTimerRef.current);
      roleSwitchReadyRetryTimerRef.current = null;
    }
    pendingRoleSwitchGuestTokenRef.current = null;
  }, []);

  const clearRoleSwitchCompletionTimeout = useCallback(() => {
    if (roleSwitchCompletionTimerRef.current !== null) {
      window.clearTimeout(roleSwitchCompletionTimerRef.current);
      roleSwitchCompletionTimerRef.current = null;
    }
  }, []);

  const startRoleSwitchCompletionTimeout = useCallback(() => {
    clearRoleSwitchCompletionTimeout();
    roleSwitchCompletionTimerRef.current = window.setTimeout(() => {
      roleSwitchCompletionTimerRef.current = null;
      setRoleSwitchInProgress(false);
      useSessionStore.getState().setRoleSwitchInProgress(false);
      setError("役割切替がタイムアウトしました。接続の再確立が完了しませんでした。");
    }, ROLE_SWITCH_COMPLETION_TIMEOUT_MS);
  }, [clearRoleSwitchCompletionTimeout, setError]);

  const setRoleAndSyncMenu = useCallback((nextRole: "host" | "guest" | null) => {
    useSessionStore.getState().setRole(nextRole);
    void window.pairpair.setSessionRole(nextRole).catch(console.error);
  }, []);

  const clearFullscreenRequest = useCallback(() => {
    fullscreenRequestPendingRef.current = false;
    if (fullscreenRequestTimerRef.current !== null) {
      window.clearTimeout(fullscreenRequestTimerRef.current);
      fullscreenRequestTimerRef.current = null;
    }
  }, []);

  const sendRoleSwitchReady = useCallback((nextHostToken: string) => {
    dataChannelManager.sendControl({ type: "session.roleSwitch.ready", hostToken: nextHostToken });
  }, []);

  const startRoleSwitchReadyRetry = useCallback((nextGuestToken: string, nextHostToken: string) => {
    clearRoleSwitchReadyRetry();
    pendingRoleSwitchGuestTokenRef.current = nextGuestToken;
    let attempts = 0;
    sendRoleSwitchReady(nextHostToken);
    roleSwitchReadyRetryTimerRef.current = window.setInterval(() => {
      attempts += 1;
      if (attempts >= ROLE_SWITCH_READY_MAX_RETRIES) {
        clearRoleSwitchReadyRetry();
        setRoleSwitchInProgress(false);
        useSessionStore.getState().setRoleSwitchInProgress(false);
        setError("役割切替に失敗しました: ゲスト側の切替確認を受信できませんでした");
        return;
      }
      sendRoleSwitchReady(nextHostToken);
    }, ROLE_SWITCH_READY_RETRY_MS);
  }, [clearRoleSwitchReadyRetry, sendRoleSwitchReady, setError]);

  const preparePeerReconnection = useCallback(async () => {
    console.info(
      `[PairPair][RoleSwitch] preparePeerReconnection role=${String(useSessionStore.getState().role)} sessionId=${sessionId ?? "<none>"}`,
    );
    clearRoleSwitchTimeout();
    clearRoleSwitchReadyRetry();
    clearRoleSwitchCompletionTimeout();
    clearFullscreenRequest();
    setShowRoleSwitchPicker(false);
    setFullscreen(false);
    void window.pairpair.hideHostOverlay().catch(console.error);
    void window.pairpair.setGuestFullscreen(false).catch(() => undefined);
    signalingClient.clearHandlers();
    hostPeerAuthenticator.reset();
    guestPeerAuthenticator.stop();
    activeStrokeRef.current = null;
    annotationsRef.current = [];
    remoteCursorRef.current = null;
    spotlightRef.current = null;
    setAnnotations([]);
    setRemoteCursor(null);
    setSpotlight(null);
    setMarkerEnabled(false);
    closePeerConnection();
    if (controlMessageHandlerRef.current) {
      dataChannelManager.onControl(controlMessageHandlerRef.current);
    }
  }, [clearFullscreenRequest, clearRoleSwitchCompletionTimeout, clearRoleSwitchReadyRetry, clearRoleSwitchTimeout, sessionId]);

  const reconnectAsGuestAfterRoleSwitch = useCallback(async (nextGuestToken: string) => {
    if (!sessionId || !signalingUrl || !code) {
      throw new Error("役割切替に必要なセッション情報が不足しています");
    }

    const nextHostName = normalizeNickname(guestDeviceName);
    console.info(
      `[PairPair][RoleSwitch] reconnectAsGuestAfterRoleSwitch sessionId=${sessionId} nextHostName=${nextHostName} token=${nextGuestToken.slice(0, 8)}`,
    );
    await preparePeerReconnection();
    startRoleSwitchCompletionTimeout();

    setRoleAndSyncMenu("guest");
    useSessionStore.getState().setHostDeviceName(nextHostName);
    useSessionStore.getState().setGuestDeviceName(null);
    useSessionStore.getState().setControlState("viewOnly");
    useSessionStore.getState().setConnectionState("connecting");
    useSessionStore.getState().setHostToken(null);
    useSessionStore.getState().setGuestToken(nextGuestToken);

    await createPeerConnectionAsGuest();
    await signalingClient.rebindRole(nextGuestToken, "guest");
    signalingClient.on("session.close", (message) => {
      if (useSessionStore.getState().roleSwitchInProgress) return;
      const payload = message.payload as { reason?: string } | undefined;
      if (payload?.reason === "host_closed") {
        finalizeSession();
      }
    });

    signalingClient.on("rtc.offer", (msg) => {
      console.info("[PairPair][RoleSwitch] guest received rtc.offer");
      const sdp = (msg.payload as { sdp?: string })?.sdp ?? "";
      void handleOffer(sdp).catch(console.error);
    });

    signalingClient.on("rtc.ice", (msg) => {
      console.info("[PairPair][RoleSwitch] guest received rtc.ice");
      const payload = msg.payload as { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
      void handleIce(payload.candidate ?? "", payload.sdpMid ?? null, payload.sdpMLineIndex ?? null).catch(console.error);
    });

    guestPeerAuthenticator.start(
      code,
      () => {
        clearRoleSwitchCompletionTimeout();
        setRoleSwitchInProgress(false);
        useSessionStore.getState().setRoleSwitchInProgress(false);
        setError("役割切替後の認証で追加パスフレーズが要求されました。現在の実装では再入力に未対応です。");
      },
      () => {
        clearRoleSwitchCompletionTimeout();
        setRoleSwitchInProgress(false);
        useSessionStore.getState().setRoleSwitchInProgress(false);
      },
      (reason) => {
        clearRoleSwitchCompletionTimeout();
        setRoleSwitchInProgress(false);
        useSessionStore.getState().setRoleSwitchInProgress(false);
        setError(`役割切替後のゲスト認証に失敗しました: ${reason}`);
      },
    );
  }, [clearRoleSwitchCompletionTimeout, code, finalizeSession, guestDeviceName, preparePeerReconnection, sessionId, setError, setRoleAndSyncMenu, signalingUrl, startRoleSwitchCompletionTimeout]);

  const reconnectAsHostAfterRoleSwitch = useCallback(async (nextHostToken: string, source: ScreenSource) => {
    if (!sessionId || !signalingUrl || !guestToken || !code) {
      throw new Error("役割切替に必要なセッション情報が不足しています");
    }

    const nextGuestName = normalizeNickname(hostDeviceName);
    const preset = selectedPreset === "Custom"
      ? ({ ...customPreset, name: "Custom" } as QualityPreset)
      : QUALITY_PRESETS[selectedPreset as Exclude<QualityPresetName, "Custom">];
    const adaptivePreset = adaptiveMode ? QUALITY_PRESETS[adaptiveResPreset] : undefined;
    console.info(
      `[PairPair][RoleSwitch] reconnectAsHostAfterRoleSwitch sessionId=${sessionId} sourceId=${source.id} sourceName=${source.name} token=${nextHostToken.slice(0, 8)}`,
    );

    await preparePeerReconnection();
    startRoleSwitchCompletionTimeout();
    await hostPeerAuthenticator.prepare(code, "");

    setRoleAndSyncMenu("host");
    useSessionStore.getState().setGuestDeviceName(nextGuestName);
    useSessionStore.getState().setHostDeviceName(null);
    useSessionStore.getState().setControlState("viewOnly");
    useSessionStore.getState().setConnectionState("connecting");
    useSessionStore.getState().setHostToken(nextHostToken);
    useSessionStore.getState().setGuestToken(guestToken);
    useSessionStore.getState().setSelectedSourceId(source.id);
    void saveToElectron("lastSourceName", source.name);
    void saveToElectron("lastSourceDisplayId", source.display_id);

    await signalingClient.rebindRole(nextHostToken, "host");
    signalingClient.on("session.close", (message) => {
      if (useSessionStore.getState().roleSwitchInProgress) return;
      const payload = message.payload as { reason?: string } | undefined;
      if (payload?.reason === "guest_disconnected") {
        handleGuestDisconnected();
      }
    });

    signalingClient.on("guest.joined", () => {
      console.info("[PairPair][RoleSwitch] host received guest.joined");
      void createPeerConnectionAsHost()
        .then(() => {
          hostPeerAuthenticator.start(
            () => {
              markPeerAuthenticated();
              void startHostScreenShare(source.id, adaptiveMode ? adaptivePreset : preset)
                .then(() => {
                  clearRoleSwitchCompletionTimeout();
                  setRoleSwitchInProgress(false);
                  useSessionStore.getState().setRoleSwitchInProgress(false);
                  if (adaptiveMode) enableAdaptive(adaptiveResPreset);
                })
                .catch((err) => {
                  clearRoleSwitchCompletionTimeout();
                  setRoleSwitchInProgress(false);
                  useSessionStore.getState().setRoleSwitchInProgress(false);
                  setError(`役割切替後の画面共有開始に失敗しました: ${String(err)}`);
                });
            },
            (reason) => {
              clearRoleSwitchCompletionTimeout();
              setRoleSwitchInProgress(false);
              useSessionStore.getState().setRoleSwitchInProgress(false);
              closePeerConnection();
              setError(`役割切替後のホスト認証に失敗しました: ${reason}`);
            },
          );
        })
        .catch((err) => {
          clearRoleSwitchCompletionTimeout();
          setRoleSwitchInProgress(false);
          useSessionStore.getState().setRoleSwitchInProgress(false);
          setError(`役割切替後のP2P接続に失敗しました: ${String(err)}`);
        });
    });

    signalingClient.on("rtc.answer", (msg) => {
      console.info("[PairPair][RoleSwitch] host received rtc.answer");
      const sdp = (msg.payload as { sdp?: string })?.sdp ?? "";
      void handleAnswer(sdp).catch(console.error);
    });

    signalingClient.on("rtc.ice", (msg) => {
      console.info("[PairPair][RoleSwitch] host received rtc.ice");
      const payload = msg.payload as { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
      void handleIce(payload.candidate ?? "", payload.sdpMid ?? null, payload.sdpMLineIndex ?? null).catch(console.error);
    });
  }, [
    adaptiveMode,
    adaptiveResPreset,
    code,
    customPreset,
    enableAdaptive,
    guestToken,
    hostDeviceName,
    preparePeerReconnection,
    selectedPreset,
    sessionId,
    setError,
    setRoleAndSyncMenu,
    signalingUrl,
    startRoleSwitchCompletionTimeout,
    clearRoleSwitchCompletionTimeout,
    handleGuestDisconnected,
  ]);

  const startGuestToHostRoleSwitch = useCallback(async (source: ScreenSource) => {
    if (isHost) return;
    if (!guestToken) {
      setError("役割切替に必要なゲストトークンが見つかりません");
      return;
    }

    pendingRoleSwitchSourceRef.current = source;
    console.info(
      `[PairPair][RoleSwitch] startGuestToHostRoleSwitch sessionId=${sessionId ?? "<none>"} sourceId=${source.id} sourceName=${source.name}`,
    );
    setShowRoleSwitchPicker(false);
    setRoleSwitchInProgress(true);
    useSessionStore.getState().setRoleSwitchInProgress(true);
    clearRoleSwitchTimeout();
    roleSwitchTimeoutRef.current = window.setTimeout(() => {
      setRoleSwitchInProgress(false);
      useSessionStore.getState().setRoleSwitchInProgress(false);
      pendingRoleSwitchSourceRef.current = null;
      setError("ホスト切替の応答がタイムアウトしました");
      roleSwitchTimeoutRef.current = null;
    }, 10000);
    dataChannelManager.sendControl({ type: "session.roleSwitch.request", guestToken });
  }, [clearRoleSwitchTimeout, guestToken, isHost, setError]);

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
    if (!sessionPermissions.annotation) return;
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
  }, [markerColor, markerWidth, sessionPermissions.annotation]);

  const appendMarkerStroke = useCallback((point: AnnotationPoint) => {
    if (!sessionPermissions.annotation) return;
    const strokeId = activeStrokeRef.current;
    if (!strokeId) return;
    upsertStrokePoint(strokeId, point);
    dataChannelManager.sendControl({ type: "annotation.stroke.append", strokeId, point });
  }, [sessionPermissions.annotation, upsertStrokePoint]);

  const endMarkerStroke = useCallback(() => {
    if (!sessionPermissions.annotation) {
      activeStrokeRef.current = null;
      return;
    }
    if (!activeStrokeRef.current) return;
    dataChannelManager.sendControl({ type: "annotation.stroke.end", strokeId: activeStrokeRef.current });
    activeStrokeRef.current = null;
  }, [sessionPermissions.annotation]);

  const handleUndoAnnotation = useCallback(() => {
    if (!sessionPermissions.annotation) return;
    setAnnotations((prev) => {
      const next = prev.slice(0, -1);
      syncHostOverlay(next, remoteCursorRef.current);
      return next;
    });
    dataChannelManager.sendControl({ type: "annotation.undo" });
  }, [sessionPermissions.annotation, syncHostOverlay]);

  const handleClearAnnotations = useCallback(() => {
    if (!sessionPermissions.annotation) return;
    setAnnotations([]);
    syncHostOverlay([], remoteCursorRef.current);
    dataChannelManager.sendControl({ type: "annotation.clear" });
  }, [sessionPermissions.annotation, syncHostOverlay]);

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

  const pushClipboardHistoryEntry = useCallback((entry: { text: string; direction: "sent" | "received"; peerRole: "host" | "guest"; timestamp: number }) => {
    useSessionStore.getState().addClipboardHistoryEntry({
      id: `${entry.timestamp}-${entry.direction}-${entry.peerRole}`,
      text: entry.text,
      direction: entry.direction,
      peerRole: entry.peerRole,
      createdAt: entry.timestamp,
    });
  }, []);

  const shareClipboardText = useCallback((text: string) => {
    if (!text || !sessionPermissions.clipboard) return;
    const timestamp = Date.now();
    dataChannelManager.sendControl({
      type: "clipboard.snippet",
      text,
      senderRole: isHost ? "host" : "guest",
      timestamp,
    });
    pushClipboardHistoryEntry({
      text,
      direction: "sent",
      peerRole: isHost ? "guest" : "host",
      timestamp,
    });
  }, [isHost, pushClipboardHistoryEntry, sessionPermissions.clipboard]);

  const pasteClipboardText = useCallback((text: string) => {
    if (!text || !sessionPermissions.clipboard || isHost) return;
    const event: TextInputEvent = { type: "text.input", text };
    if (adaptiveMode) {
      adaptiveQualityController.onInputEvent(event);
    }
    dataChannelManager.sendInput(event);
    shareClipboardText(text);
  }, [adaptiveMode, isHost, sessionPermissions.clipboard, shareClipboardText]);

  const receiveClipboardText = useCallback((text: string) => {
    void navigator.clipboard.writeText(text).catch(console.error);
  }, []);

  const sendSpotlight = useCallback((point: AnnotationPoint) => {
    if (isHost) return;
    const nextSpotlight: SpotlightIndicator = {
      x: point.x,
      y: point.y,
      label: "ここを見て",
      visible: true,
      timestamp: Date.now(),
    };
    setSpotlightWithTimeout(nextSpotlight);
    dataChannelManager.sendControl({ type: "spotlight.show", spotlight: nextSpotlight });
  }, [isHost, setSpotlightWithTimeout]);

  const toggleGuestFullscreen = useCallback(() => {
    if (fullscreenRequestPendingRef.current) return;
    const previousFullscreen = fullscreenRef.current;
    const nextFullscreen = !previousFullscreen;
    fullscreenRequestPendingRef.current = true;
    fullscreenRequestTimerRef.current = window.setTimeout(() => {
      clearFullscreenRequest();
      setError("全画面表示の切り替え応答がタイムアウトしました");
    }, FULLSCREEN_REQUEST_TIMEOUT_MS);
    void window.pairpair.setGuestFullscreen(nextFullscreen).then((accepted) => {
      if (!accepted) {
        clearFullscreenRequest();
        setError("全画面表示の切り替えに失敗しました");
      }
    }).catch((err) => {
      clearFullscreenRequest();
      setFullscreen(previousFullscreen);
      console.error(err);
    });
  }, [clearFullscreenRequest, setError]);

  const restoreToolboxIntoView = useCallback(() => {
    setToolboxMinimized(false);
    setToolboxDimmed(false);
    const placeToolbar = () => {
      const panelWidth = toolboxElementRef.current?.offsetWidth ?? 320;
      const panelHeight = toolboxElementRef.current?.offsetHeight ?? 260;
      const bounds = getToolboxBounds(panelWidth, panelHeight, fullscreen, displayMode);
      setToolboxPosition({
        x: bounds.maxX,
        y: bounds.minY,
      });
    };
    placeToolbar();
    window.setTimeout(placeToolbar, 0);
  }, [displayMode, fullscreen]);

  const refreshToolboxActivity = useCallback(() => {
    if (isHost) return;
    setToolboxDimmed(false);
    if (toolboxIdleTimerRef.current !== null) {
      window.clearTimeout(toolboxIdleTimerRef.current);
    }
    toolboxIdleTimerRef.current = window.setTimeout(() => {
      setToolboxDimmed(true);
      toolboxIdleTimerRef.current = null;
    }, TOOLBAR_IDLE_FADE_MS);
  }, [isHost]);

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
        handleReleaseControl();
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
      if (toolboxIdleTimerRef.current !== null) {
        window.clearTimeout(toolboxIdleTimerRef.current);
      }
      if (spotlightTimerRef.current !== null) {
        window.clearTimeout(spotlightTimerRef.current);
        spotlightTimerRef.current = null;
      }
      clearFullscreenRequest();
      clearRoleSwitchCompletionTimeout();
      clearRoleSwitchTimeout();
    };
  }, [clearFullscreenRequest, clearRoleSwitchCompletionTimeout, clearRoleSwitchTimeout, handleDisconnect, handleReleaseControl, isHost]);

  useEffect(() => {
    void window.pairpair.setSessionRole(role).catch(console.error);
  }, [role]);

  useEffect(() => {
    if (isHost) return;

    const handleActivity = () => {
      refreshToolboxActivity();
    };

    refreshToolboxActivity();
    window.addEventListener("pointermove", handleActivity, { passive: true });
    window.addEventListener("pointerdown", handleActivity, { passive: true });
    window.addEventListener("wheel", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity);

    return () => {
      window.removeEventListener("pointermove", handleActivity);
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("wheel", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      if (toolboxIdleTimerRef.current !== null) {
        window.clearTimeout(toolboxIdleTimerRef.current);
        toolboxIdleTimerRef.current = null;
      }
    };
  }, [isHost, refreshToolboxActivity]);

  useEffect(() => {
    isHostRef.current = isHost;
    roleSwitchInProgressRef.current = roleSwitchInProgress;
    fullscreenRef.current = fullscreen;
  }, [fullscreen, isHost, roleSwitchInProgress]);

  useEffect(() => {
    const handlePromoteGuestToHost = () => {
      if (isHostRef.current || roleSwitchInProgressRef.current) return;
      setShowRoleSwitchPicker(true);
    };

    window.pairpair.onPromoteGuestToHost(handlePromoteGuestToHost);
    return () => {
      window.pairpair.removePromoteGuestToHostListener();
    };
  }, []);

  useEffect(() => {
    if (isHost || !fullscreen) return;

    const handleContextMenuCapture = (event: MouseEvent) => {
      event.preventDefault();
      restoreToolboxIntoView();
    };

    window.addEventListener("contextmenu", handleContextMenuCapture, true);
    return () => {
      window.removeEventListener("contextmenu", handleContextMenuCapture, true);
    };
  }, [fullscreen, isHost, restoreToolboxIntoView]);

  useEffect(() => {
    const handleFullscreenChanged = (nextFullscreen: boolean) => {
      clearFullscreenRequest();
      setFullscreen(nextFullscreen);

      if (fullscreenHintTimerRef.current !== null) {
        window.clearTimeout(fullscreenHintTimerRef.current);
        fullscreenHintTimerRef.current = null;
      }

      if (nextFullscreen) {
        setToolboxPosition((prev) => ({
          x: Math.max(12, prev.x),
          y: Math.max(12, prev.y),
        }));
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
  }, [clearFullscreenRequest]);

  useEffect(() => {
    if (!fullscreen) {
      setToolboxPosition((prev) => ({
        x: prev.x,
        y: Math.max(64, prev.y),
      }));
    }

    const handlePointerMove = (event: PointerEvent) => {
      const drag = toolboxDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const panelWidth = toolboxElementRef.current?.offsetWidth ?? (toolboxMinimized ? 240 : 320);
      const panelHeight = toolboxElementRef.current?.offsetHeight ?? (toolboxMinimized ? 52 : 260);
      const bounds = getToolboxBounds(panelWidth, panelHeight, fullscreen, displayMode);
      const nextX = drag.originX + (event.clientX - drag.startX);
      const nextY = drag.originY + (event.clientY - drag.startY);
      setToolboxPosition({
        x: Math.min(Math.max(bounds.minX, nextX), bounds.maxX),
        y: Math.min(Math.max(bounds.minY, nextY), bounds.maxY),
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (toolboxDragRef.current?.pointerId === event.pointerId) {
        toolboxDragRef.current = null;
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [displayMode, fullscreen, toolboxMinimized]);

  useEffect(() => {
    const clampToolboxPosition = () => {
      const panelWidth = toolboxElementRef.current?.offsetWidth ?? (toolboxMinimized ? 240 : 320);
      const panelHeight = toolboxElementRef.current?.offsetHeight ?? (toolboxMinimized ? 52 : 260);
      const bounds = getToolboxBounds(panelWidth, panelHeight, fullscreen, displayMode);

      setToolboxPosition((prev) => ({
        x: Math.min(Math.max(bounds.minX, prev.x), bounds.maxX),
        y: Math.min(Math.max(bounds.minY, prev.y), bounds.maxY),
      }));
    };

    window.addEventListener("resize", clampToolboxPosition);
    clampToolboxPosition();
    return () => {
      window.removeEventListener("resize", clampToolboxPosition);
    };
  }, [displayMode, fullscreen, toolboxMinimized]);

  const handleToolboxDragStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    toolboxDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: toolboxPosition.x,
      originY: toolboxPosition.y,
    };
  }, [fullscreen, toolboxPosition.x, toolboxPosition.y]);

  const markerToolbar = (
    <MarkerToolbar
      enabled={markerEnabled}
      color={markerColor}
      width={markerWidth}
      displayMode={displayMode}
      wheelDirection={wheelDirection}
      fullscreen={fullscreen}
      controlActive={!isHost && controlState === "controlAllowed"}
      minimized={toolboxMinimized}
      onToggle={() => {
        if (!sessionPermissions.annotation) return;
        setMarkerEnabled((prev) => !prev);
      }}
      onEnable={() => {
        if (!sessionPermissions.annotation) return;
        setMarkerEnabled(true);
      }}
      onDisplayModeChange={setDisplayMode}
      onWheelDirectionChange={(direction) => {
        void saveToElectron("wheelDirection", direction);
      }}
      onColorChange={setMarkerColor}
      onWidthChange={setMarkerWidth}
      onUndo={handleUndoAnnotation}
      onClear={handleClearAnnotations}
      canUndo={sessionPermissions.annotation && annotations.length > 0}
      hasStrokes={sessionPermissions.annotation && annotations.length > 0}
      onToggleFullscreen={toggleGuestFullscreen}
      onToggleMinimized={() => setToolboxMinimized((prev) => !prev)}
      onReturnControl={handleReleaseControl}
      dragHandleProps={{ onPointerDown: handleToolboxDragStart }}
    />
  );

  useEffect(() => {
    if (isHost && adaptiveMode && !adaptiveQualityController.enabled) {
      enableAdaptive();
    }
  }, [adaptiveMode, enableAdaptive, isHost]);

  useEffect(() => {
    if (!isHost) return;
    if (!adaptiveMode && controlState !== "controlAllowed") return;

    void window.pairpair.startActivityMonitor();
    window.pairpair.onSystemActivity(() => {
      if (controlState === "controlAllowed") {
        handleReleaseControl();
      }
      if (adaptiveMode) {
        adaptiveQualityController.notifyActivity("mouse_moving");
      }
    });

    return () => {
      window.pairpair.removeSystemActivityListener();
      void window.pairpair.stopActivityMonitor();
    };
  }, [adaptiveMode, controlState, handleReleaseControl, isHost]);

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
    spotlightRef.current = spotlight;
  }, [spotlight]);

  useEffect(() => {
    if (!sessionPermissions.annotation) {
      setMarkerEnabled(false);
      activeStrokeRef.current = null;
    }
  }, [sessionPermissions.annotation]);

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
    if (isHost || !sessionPermissions.clipboard) return;
    const handlePaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!text) return;
      event.preventDefault();
      pasteClipboardText(text);
    };
    document.addEventListener("paste", handlePaste, { capture: true });
    return () => {
      document.removeEventListener("paste", handlePaste, { capture: true });
    };
  }, [isHost, pasteClipboardText, sessionPermissions.clipboard]);

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
        case "spotlight.show": {
          setSpotlightWithTimeout(message.spotlight);
          break;
        }
        case "clipboard.snippet": {
          pushClipboardHistoryEntry({
            text: message.text,
            direction: "received",
            peerRole: message.senderRole,
            timestamp: message.timestamp,
          });
          break;
        }
        case "permission.profile.updated": {
          if (isHost) return;
          useSessionStore.getState().setPermissionPreset(message.presetId, message.permissions);
          if (!message.permissions.annotation) {
            setMarkerEnabled(false);
          }
          if (!hasInteractiveControl(message.permissions)) {
            useSessionStore.getState().setControlState("viewOnly");
          }
          break;
        }
        case "session.roleSwitch.request": {
          if (!isHost || !hostToken) return;
          console.info("[PairPair][RoleSwitch] host received roleSwitch.request");
          setRoleSwitchInProgress(true);
          useSessionStore.getState().setRoleSwitchInProgress(true);
          clearRoleSwitchTimeout();
          startRoleSwitchReadyRetry(message.guestToken, hostToken);
          break;
        }
        case "session.roleSwitch.readyAck": {
          if (!isHost) return;
          const nextGuestToken = pendingRoleSwitchGuestTokenRef.current;
          if (!nextGuestToken) return;
          console.info("[PairPair][RoleSwitch] host received roleSwitch.readyAck");
          clearRoleSwitchReadyRetry();
          window.setTimeout(() => {
            void reconnectAsGuestAfterRoleSwitch(nextGuestToken).catch((err) => {
              setRoleSwitchInProgress(false);
              useSessionStore.getState().setRoleSwitchInProgress(false);
              setError(`役割切替に失敗しました: ${String(err)}`);
            });
          }, 50);
          break;
        }
        case "session.roleSwitch.ready": {
          if (isHost) return;
          const source = pendingRoleSwitchSourceRef.current;
          if (!source) return;
          console.info("[PairPair][RoleSwitch] guest received roleSwitch.ready");
          clearRoleSwitchTimeout();
          pendingRoleSwitchSourceRef.current = null;
          dataChannelManager.sendControl({ type: "session.roleSwitch.readyAck" });
          window.setTimeout(() => {
            void reconnectAsHostAfterRoleSwitch(message.hostToken, source).catch((err) => {
              setRoleSwitchInProgress(false);
              useSessionStore.getState().setRoleSwitchInProgress(false);
              setError(`役割切替に失敗しました: ${String(err)}`);
            });
          }, 0);
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
  }, [
    clearRoleSwitchReadyRetry,
    clearRoleSwitchTimeout,
    hostToken,
    isHost,
    startRoleSwitchReadyRetry,
    reconnectAsGuestAfterRoleSwitch,
    reconnectAsHostAfterRoleSwitch,
    receiveClipboardText,
    pushClipboardHistoryEntry,
    setCursorWithTimeout,
    setSpotlightWithTimeout,
    setError,
    syncHostOverlay,
    upsertStrokePoint,
  ]);

  useEffect(() => {
    if (!isHost) return;
    const sendPermissions = () => {
      dataChannelManager.sendControl({
        type: "permission.profile.updated",
        presetId: permissionPresetId,
        permissions: sessionPermissions,
      });
    };
    dataChannelManager.onControlOpen(sendPermissions);
    return () => {
      dataChannelManager.offControlOpen(sendPermissions);
    };
  }, [isHost, permissionPresetId, sessionPermissions]);

  useEffect(() => {
    if (!isHost) return;
    syncHostOverlay(annotations, remoteCursor, spotlight);
  }, [annotations, isHost, remoteCursor, spotlight, syncHostOverlay]);

  useEffect(() => {
    const handleSessionClose = (message: Record<string, unknown>) => {
      if (useSessionStore.getState().roleSwitchInProgress) return;
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
      if (
        sessionPermissions.clipboard &&
        (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") || (e.shiftKey && e.key === "Insert"))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
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

      if (controlState !== "controlAllowed" || !sessionPermissions.keyboard) return;
      e.preventDefault();
      // 明示モード（かな/英数キー）の IME イベント
      const imeEvent = getImeModeEvent(e);
      if (imeEvent) {
        if (!e.repeat) {
          guestImeModeRef.current = imeEvent.mode;
          if (adaptiveMode) {
            adaptiveQualityController.onInputEvent(imeEvent);
          }
          dataChannelManager.sendInput(imeEvent);
        }
        return;
      }
      // トグルキー（半角/全角など）: ローカル状態を反転して明示モードを送る
      // "toggle" は絶対に送らない（ホスト側で意図しないCmd+Space等が発生するのを防ぐ）
      if (IME_TOGGLE_KEY_NAMES.has(e.key) || IME_TOGGLE_KEY_NAMES.has(e.code)) {
        if (!e.repeat) {
          const nextMode = guestImeModeRef.current === "latin" ? "japanese" : "latin";
          guestImeModeRef.current = nextMode;
          const toggledEvent: ImeModeEvent = { type: "ime.mode", mode: nextMode };
          if (adaptiveMode) {
            adaptiveQualityController.onInputEvent(toggledEvent);
          }
          dataChannelManager.sendInput(toggledEvent);
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
      if (
        sessionPermissions.clipboard &&
        (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") || (e.shiftKey && e.key === "Insert"))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === "Escape" && (fullscreen || markerEnabled)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (controlState !== "controlAllowed" || !sessionPermissions.keyboard) return;
      e.preventDefault();
      if (getImeModeEvent(e)) return;
      if (IME_TOGGLE_KEY_NAMES.has(e.key) || IME_TOGGLE_KEY_NAMES.has(e.code)) return;
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
  }, [controlState, fullscreen, handleClearAnnotations, isHost, markerEnabled, sessionPermissions.clipboard, sessionPermissions.keyboard]);

  // macOS ゲスト用: TIS ポーリングで検知した IME モード変化を処理する
  // JIS キー、メニューバー ABC/あ ボタン、Ctrl+Space (US キーボード)、Globe キー
  // など**あらゆる**入力ソース切り替えを統一的にカバーする
  useEffect(() => {
    if (isHost) return;

    const handleImeKey = (input: { mode: string }) => {
      const { controlState: currentControlState, sessionPermissions: currentPermissions } = useSessionStore.getState();
      if (currentControlState !== "controlAllowed" || !currentPermissions.keyboard) return;
      if (input.mode !== "japanese" && input.mode !== "latin") return;

      const imeEvent: ImeModeEvent = {
        type: "ime.mode",
        mode: input.mode as "japanese" | "latin",
      };
      if (adaptiveQualityController.enabled) {
        adaptiveQualityController.onInputEvent(imeEvent);
      }
      dataChannelManager.sendInput(imeEvent);
    };

    window.pairpair.onImeKey(handleImeKey);
    return () => {
      window.pairpair.removeImeKeyListener();
    };
  }, [isHost]);

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
          <span style={{ color: "#aaa", fontSize: 13 }}>接続先: {remoteGuestName}</span>
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
            justifyContent: "flex-start",
            padding: 24,
            minHeight: 0,
            overflowY: "auto",
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
                  状態: {STATE_LABEL[adaptiveState]} - {getAdaptiveProfile(adaptiveState).fps} fps /{" "}
                  {calcBitrateMbps(
                    getAdaptiveProfile(adaptiveState).quality,
                    QUALITY_PRESETS[adaptiveResPreset].width,
                    QUALITY_PRESETS[adaptiveResPreset].height,
                    getAdaptiveProfile(adaptiveState).fps,
                  )}{" "}
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
                  const profile = getAdaptiveProfile(state);
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

        <PermissionPanel
          role="host"
          onSendClipboardText={shareClipboardText}
          clipboardHistory={clipboardHistory}
          onReceiveClipboardText={receiveClipboardText}
          onClearClipboardHistory={() => useSessionStore.getState().clearClipboardHistory()}
        />
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
          <span style={{ color: "#aaa", fontSize: 13 }}>接続先: {remoteHostName}</span>
          <StatsOverlay stats={stats} visible={showStats} onToggle={() => setShowStats(!showStats)} />
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
        spotlight={spotlight}
        markerEnabled={markerEnabled}
        onMarkerStart={beginMarkerStroke}
        onMarkerMove={appendMarkerStroke}
        onMarkerEnd={endMarkerStroke}
        onHoverPreview={handleHoverPreview}
        onSpotlight={sendSpotlight}
        fullscreen={fullscreen}
        displayMode={displayMode}
        wheelDirection={wheelDirection}
        sessionPermissions={sessionPermissions}
        adaptiveMode={adaptiveMode}
      />

      <div
        ref={toolboxElementRef}
        style={{
          position: "absolute",
          left: toolboxPosition.x,
          top: toolboxPosition.y,
          zIndex: 20,
          pointerEvents: "auto",
          opacity: toolboxDimmed ? 0.5 : 1,
          transition: "opacity 160ms ease",
        }}
      >
        {markerToolbar}
      </div>

      {showRoleSwitchPicker && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.78)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
          onClick={() => setShowRoleSwitchPicker(false)}
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
            <h3 style={{ color: "#fff", marginBottom: 8, fontSize: 18 }}>自分をホストに切り替え</h3>
            <p style={{ color: "#9cb0c8", marginTop: 0, marginBottom: 20, fontSize: 13 }}>
              共有する画面やアプリを選択すると、現在のホストとゲストの役割を入れ替えます。
            </p>
            <ScreenSourcePicker
              onSelect={(source) => {
                void startGuestToHostRoleSwitch(source);
              }}
            />
            <button
              onClick={() => setShowRoleSwitchPicker(false)}
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

      {roleSwitchInProgress && (
        <div
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            zIndex: 1000,
            padding: "12px 16px",
            borderRadius: 10,
            background: "rgba(10, 16, 28, 0.92)",
            border: "1px solid rgba(255,255,255,0.14)",
            color: "#fff",
            boxShadow: "0 18px 36px rgba(0,0,0,0.34)",
          }}
        >
          役割を切り替えています...
        </div>
      )}

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

      {!fullscreen && (
        <PermissionPanel
          role="guest"
          onSendClipboardText={shareClipboardText}
          onPasteClipboardText={pasteClipboardText}
          clipboardHistory={clipboardHistory}
          onReceiveClipboardText={receiveClipboardText}
          onClearClipboardHistory={() => useSessionStore.getState().clearClipboardHistory()}
        />
      )}
    </div>
  );
}
