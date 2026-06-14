import React, { useState, useEffect, useRef, useCallback } from "react";
import type { QualityPresetName, QualityPreset } from "@pairpair/shared";
import { useAppStore } from "../store/app-store";
import { useSessionStore } from "../store/session-store";
import { useSettingsStore } from "../store/settings-store";
import { ScreenSourcePicker } from "../components/ScreenSourcePicker";
import { QualityPresetSelector } from "../components/QualityPresetSelector";
import { signalingClient } from "../webrtc/signaling-client";
import { createPeerConnectionAsHost, startHostScreenShare, markPeerAuthenticated, closePeerConnection, applyQualityPreset, setAdaptiveParameters, getLocalStreamResolution } from "../webrtc/rtc-client";
import { dataChannelManager } from "../webrtc/data-channel";
import { hostPeerAuthenticator } from "../webrtc/peer-auth";
import { adaptiveQualityController } from "../webrtc/adaptive-quality";
import { QUALITY_PRESETS, calcBitrateMbps } from "@pairpair/shared";
import type { InputEvent } from "@pairpair/shared";
import { normalizeNickname } from "../display-name";
import { getRecentSessionSummary, isRecentSessionResumable } from "../session-resume";

const SERVER_URL = "https://pairpair-signaling-server-245497898064.asia-northeast1.run.app";

const STATE_LABEL: Record<string, string> = {
  idle: "アイドル",
  mouse_moving: "マウス移動",
  scrolling: "スクロール",
  typing: "タイプ中",
  clicking: "クリック",
};

const resumeCardStyle: React.CSSProperties = {
  marginBottom: 24,
  padding: 18,
  borderRadius: 14,
  background: "linear-gradient(180deg, rgba(40,57,92,0.92) 0%, rgba(18,28,48,0.94) 100%)",
  border: "1px solid rgba(120, 175, 255, 0.24)",
  boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
};

const primaryActionButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#4a9eff",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 700,
};

const inlineDangerButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "transparent",
  color: "#ff9e9e",
  border: "1px solid rgba(255, 120, 120, 0.35)",
  borderRadius: 8,
  fontSize: 12,
};

export function HostPage(): React.ReactElement {
  const { navigate, setError, pendingHostRestart, clearPendingHostRestart } = useAppStore();
  const {
    setSessionId,
    setCode,
    setRole,
    setExpiresAt,
    setGuestDeviceName,
    setSignalingUrl,
    setHostToken,
    setGuestToken,
    setSelectedSourceId: setSessionSelectedSourceId,
    code,
    expiresAt,
  } = useSessionStore();
  const settings = useSettingsStore();
  const { pairproProfiles, recentSession } = settings;
  const localNickname = normalizeNickname(settings.nickname);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<ScreenSource | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<QualityPresetName>(settings.lastHostPreset ?? settings.defaultPreset);
  const [customPreset, setCustomPreset] = useState<Partial<QualityPreset>>(settings.lastHostCustomPreset as Partial<QualityPreset>);
  const [creating, setCreating] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600);
  const [copied, setCopied] = useState(false);
  const [adaptiveMode, setAdaptiveMode] = useState(settings.lastHostAdaptiveMode);
  const [adaptiveState, setAdaptiveState] = useState(adaptiveQualityController.state);
  const [adaptiveBasePreset, setAdaptiveBasePreset] = useState<Exclude<QualityPresetName, "Custom">>(
    settings.lastHostAdaptiveBasePreset === "Custom" ? "Balanced" : settings.lastHostAdaptiveBasePreset as Exclude<QualityPresetName, "Custom">,
  );
  const [passphrase, setPassphrase] = useState("");
  const adaptiveInputHandlerRef = useRef<((e: InputEvent) => void) | null>(null);
  const handleSourceSelect = useCallback((source: ScreenSource) => {
    setSelectedSource(source);
    setSelectedSourceId(source.id);
  }, []);

  const saveRecentHostSession = useCallback(async (nextGuestDeviceName: string | null = null) => {
    await settings.setRecentSession({
      version: 1,
      role: "host",
      hostDeviceName: localNickname,
      guestDeviceName: nextGuestDeviceName,
      sourceName: selectedSource?.name ?? settings.lastSourceName,
      sourceDisplayId: selectedSource?.display_id ?? settings.lastSourceDisplayId,
      requiresPassphrase: passphrase.trim().length > 0,
      savedAt: Date.now(),
    });
  }, [localNickname, passphrase, selectedSource, settings]);

  useEffect(() => {
    if (!waiting || !expiresAt) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [waiting, expiresAt]);

  // Sync adaptive state label every 500ms when adaptive mode is on
  useEffect(() => {
    if (!adaptiveMode) return;
    const timer = setInterval(() => setAdaptiveState(adaptiveQualityController.state), 500);
    return () => clearInterval(timer);
  }, [adaptiveMode]);

  const enableAdaptive = useCallback(() => {
    // Resolution was already set in createPeerConnectionAsHost — only register handler + start controller
    useSessionStore.getState().setAdaptiveBasePreset(adaptiveBasePreset);

    const handler = (event: InputEvent) => adaptiveQualityController.onInputEvent(event);
    adaptiveInputHandlerRef.current = handler;
    dataChannelManager.onInput(handler);
    // Use the ACTUAL captured stream resolution (not the preset dimensions).
    // The screen may be portrait or a different resolution than the preset.
    const actual = getLocalStreamResolution();
    adaptiveQualityController.enable(
      pairproProfiles,
      (fps, bitrateMbps) => { void setAdaptiveParameters(fps, bitrateMbps); },
      actual?.width  ?? QUALITY_PRESETS[adaptiveBasePreset].width,
      actual?.height ?? QUALITY_PRESETS[adaptiveBasePreset].height,
    );
    setAdaptiveMode(true);
  }, [pairproProfiles, adaptiveBasePreset]);

  const disableAdaptive = useCallback(() => {
    adaptiveQualityController.disable();
    if (adaptiveInputHandlerRef.current) {
      dataChannelManager.offInput(adaptiveInputHandlerRef.current);
      adaptiveInputHandlerRef.current = null;
    }
    setAdaptiveMode(false);
    // Restore the current quality preset
    const preset = selectedPreset === "Custom"
      ? ({ ...customPreset, name: "Custom" } as QualityPreset)
      : QUALITY_PRESETS[selectedPreset as Exclude<QualityPresetName, "Custom">];
    void applyQualityPreset(preset).catch(console.warn);
  }, [selectedPreset, customPreset]);

  const connectExistingHostSession = useCallback(async (params: {
    sessionId: string;
    sessionCode: string;
    hostToken: string;
    wsUrl: string;
    expiresAt: string | null;
  }) => {
    if (!selectedSourceId) {
      setError("共有する画面を選択してください");
      return;
    }

    setSessionId(params.sessionId);
    setCode(params.sessionCode);
    setRole("host");
    setExpiresAt(params.expiresAt);
    setSignalingUrl(params.wsUrl);
    setHostToken(params.hostToken);
    setGuestToken(null);
    setSessionSelectedSourceId(selectedSourceId);

    await hostPeerAuthenticator.prepare(params.sessionCode, passphrase.trim());

    if (selectedSource) {
      void settings.saveToElectron("lastSourceName", selectedSource.name);
      void settings.saveToElectron("lastSourceDisplayId", selectedSource.display_id);
    }
    void settings.saveToElectron("lastHostPreset", selectedPreset);
    void settings.saveToElectron("lastHostCustomPreset", customPreset);
    void settings.saveToElectron("lastHostAdaptiveMode", adaptiveMode);
    void settings.saveToElectron("lastHostAdaptiveBasePreset", adaptiveBasePreset);

    signalingClient.connect(params.wsUrl, params.sessionId, params.hostToken, "host");

    signalingClient.on("guest.joined", (msg) => {
      const payload = msg.payload as { guestDeviceName?: string };
      const guestName = normalizeNickname(payload.guestDeviceName);
      setGuestDeviceName(guestName);
      void saveRecentHostSession(guestName);

      const currentPreset = selectedPreset === "Custom"
        ? ({ ...customPreset, name: selectedPreset } as QualityPreset)
        : QUALITY_PRESETS[selectedPreset as Exclude<QualityPresetName, "Custom">];

      useSessionStore.getState().setAdaptiveModeActive(adaptiveMode);
      if (adaptiveMode) {
        useSessionStore.getState().setAdaptiveBasePreset(adaptiveBasePreset);
      }

      const adaptivePreset = adaptiveMode ? QUALITY_PRESETS[adaptiveBasePreset] : undefined;
      void createPeerConnectionAsHost()
        .then(() => {
          hostPeerAuthenticator.start(
            () => {
              markPeerAuthenticated();
              void startHostScreenShare(selectedSourceId, adaptiveMode ? adaptivePreset : currentPreset)
                .then(() => {
                  if (adaptiveMode) enableAdaptive();
                  navigate("host-session");
                })
                .catch((err) => setError(`画面共有開始失敗: ${String(err)}`));
            },
            (reason) => {
              closePeerConnection();
              setError(`P2P認証に失敗しました: ${reason}`);
            },
          );
          if (adaptiveMode) {
            useSessionStore.getState().setAdaptiveBasePreset(adaptiveBasePreset);
          }
        })
        .catch((err) => setError(`P2P認証接続失敗: ${String(err)}`));
    });

    signalingClient.on("rtc.answer", (msg) => {
      void import("../webrtc/rtc-client").then(({ handleAnswer }) => {
        const sdp = (msg.payload as { sdp?: string })?.sdp ?? "";
        return handleAnswer(sdp);
      }).catch(console.error);
    });

    signalingClient.on("rtc.ice", (msg) => {
      void import("../webrtc/rtc-client").then(({ handleIce }) => {
        const payload = msg.payload as { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
        return handleIce(payload.candidate ?? "", payload.sdpMid ?? null, payload.sdpMLineIndex ?? null);
      }).catch(console.error);
    });

    setWaiting(true);
    await saveRecentHostSession();
  }, [
    adaptiveBasePreset,
    adaptiveMode,
    customPreset,
    enableAdaptive,
    navigate,
    passphrase,
    selectedPreset,
    selectedSource,
    selectedSourceId,
    setCode,
    setError,
    setExpiresAt,
    setGuestDeviceName,
    setGuestToken,
    setHostToken,
    setRole,
    setSessionId,
    setSessionSelectedSourceId,
    setSignalingUrl,
    settings,
    saveRecentHostSession,
  ]);

  // Cleanup on unmount — only remove the DataChannel handler,
  // do NOT disable adaptive (SessionPage will re-enable it on mount)
  useEffect(() => {
    return () => {
      if (adaptiveInputHandlerRef.current) {
        dataChannelManager.offInput(adaptiveInputHandlerRef.current);
      }
    };
  }, []);

  const handleCreateSession = async () => {
    if (!selectedSourceId) {
      setError("共有する画面を選択してください");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/sessions/host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appVersion: "0.1.0",
          deviceName: localNickname,
          platform: window.pairpair.platform,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({})) as { error?: string; code?: string };
        throw new Error(`セッション作成エラー: ${errorData.error || res.statusText} (${res.status})`);
      }
      
      const data = (await res.json()) as {
        sessionId: string;
        code: string;
        hostToken: string;
        expiresAt: string;
        wsUrl: string;
      };

      await connectExistingHostSession({
        sessionId: data.sessionId,
        sessionCode: data.code,
        hostToken: data.hostToken,
        wsUrl: data.wsUrl,
        expiresAt: data.expiresAt,
      });
    } catch (err) {
      setError(`セッション作成失敗: ${String(err)}`);
    } finally {
      setCreating(false);
    }
  };

  const handleReuseSettings = () => {
    if (!isRecentSessionResumable(recentSession) || recentSession.role !== "host") {
      setError("前回設定が見つかりません");
      return;
    }

    if (!selectedSourceId) {
      setError("共有する画面を選択してください");
      return;
    }

    clearPendingHostRestart();
    void handleCreateSession();
  };

  useEffect(() => {
    if (!pendingHostRestart) return;

    if (waiting || creating) return;

    if (!isRecentSessionResumable(recentSession) || recentSession.role !== "host") {
      clearPendingHostRestart();
      setError("前回のホスト設定が見つかりません");
      return;
    }

    if (!selectedSourceId) {
      return;
    }

    clearPendingHostRestart();
    void handleCreateSession();
  }, [
    clearPendingHostRestart,
    creating,
    pendingHostRestart,
    recentSession,
    selectedSourceId,
    setError,
    waiting,
  ]);

  const handleCancel = () => {
    void settings.setRecentSession(null);
    signalingClient.disconnect();
    navigate("home");
  };

  const handleCopy = () => {
    if (code) {
      void navigator.clipboard.writeText(code).catch(console.error);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatCode = (c: string) => {
    if (c.length === 6) return `${c.slice(0, 3)} ${c.slice(3)}`;
    return c;
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  if (waiting && code) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 24,
        }}
      >
        <h2 style={{ color: "#4a9eff" }}>ゲストを待っています</h2>
        <div style={{ color: "#aaa", fontSize: 13 }}>あなたの表示名: {localNickname}</div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#888", fontSize: 14, marginBottom: 8 }}>接続コード</div>
          <div style={{ fontSize: 48, fontWeight: "bold", letterSpacing: 8, color: "#fff" }}>{formatCode(code)}</div>
          <div style={{ color: "#888", fontSize: 13, marginTop: 8 }}>このコードをゲストに伝えてください</div>
          <div style={{ color: timeLeft < 60 ? "#ff4444" : "#aaa", fontSize: 13, marginTop: 4 }}>
            有効期限: {formatTime(timeLeft)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={handleCopy}
            style={{ padding: "8px 20px", background: "#333", color: "#fff", border: "1px solid #555", borderRadius: 6 }}
          >
            {copied ? "コピーしました" : "コードをコピー"}
          </button>
          <button
            onClick={handleCancel}
            style={{
              padding: "8px 20px",
              background: "transparent",
              color: "#ff4444",
              border: "1px solid #ff4444",
              borderRadius: 6,
            }}
          >
            キャンセル
          </button>
        </div>

        {/* Adaptive Quality Status */}
        <div
          style={{
            background: "#1a1a2e",
            border: "1px solid #333",
            borderRadius: 8,
            padding: "12px 16px",
            width: "100%",
            maxWidth: 360,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 13, color: "#888", marginBottom: 4 }}>
            画質モード: {adaptiveMode ? <span style={{ color: "#4a9eff" }}>適応モード（PairPro）</span> : <span style={{ color: "#ccc" }}>従来のプリセット（{selectedPreset}）</span>}
          </div>
          {adaptiveMode && (
            <div style={{ fontSize: 11, color: "#4a9eff", marginTop: 4 }}>
              状態: {STATE_LABEL[adaptiveState]} — {pairproProfiles[adaptiveState].fps} fps / {calcBitrateMbps(pairproProfiles[adaptiveState].quality, QUALITY_PRESETS[adaptiveBasePreset].width, QUALITY_PRESETS[adaptiveBasePreset].height, pairproProfiles[adaptiveState].fps)} Mbps
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: "0 auto", overflowY: "auto", height: "100%" }}>
      <h2 style={{ marginBottom: 24, color: "#4a9eff" }}>ホストとして開始</h2>

      {isRecentSessionResumable(recentSession) && recentSession.role === "host" && (
        <div style={resumeCardStyle}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ color: "#fff", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>前回のホスト設定</div>
              <div style={{ color: "#9cb0c8", fontSize: 13, lineHeight: 1.7 }}>
                {getRecentSessionSummary(recentSession)}
                {recentSession.guestDeviceName && (
                  <>
                    <br />
                    直前の相手: {recentSession.guestDeviceName}
                  </>
                )}
                {recentSession.requiresPassphrase && (
                  <>
                    <br />
                    前回はあいことば付きでした。必要なら下の入力欄に再入力してください。
                  </>
                )}
              </div>
            </div>
            <button onClick={() => void settings.setRecentSession(null)} style={inlineDangerButtonStyle}>
              破棄
            </button>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button
              onClick={() => void handleReuseSettings()}
              disabled={creating || !selectedSourceId}
              style={{
                ...primaryActionButtonStyle,
                opacity: creating || !selectedSourceId ? 0.6 : 1,
              }}
            >
              {creating ? "作成中..." : "ホストをやり直す"}
            </button>
            <div style={{ color: "#7f8ea8", fontSize: 12, alignSelf: "center" }}>
              前回の共有先や画質は引き継ぎます。コードは毎回新しく発行されます。
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <ScreenSourcePicker
          onSelect={handleSourceSelect}
          initialSourceName={settings.lastSourceName}
          initialDisplayId={settings.lastSourceDisplayId}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 12 }}>画質設定</h3>

        {/* Mode selector tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 12, borderRadius: 6, overflow: "hidden", border: "1px solid #444" }}>
          {[
            { key: false, label: "従来のプリセット" },
            { key: true,  label: "適応モード（PairPro）" },
          ].map(({ key, label }) => (
            <button
              key={String(key)}
              onClick={() => setAdaptiveMode(key as boolean)}
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

              // Apply immediately if already connected
              if (useSessionStore.getState().connectionState === "connected") {
                const qualityPreset = preset === "Custom"
                  ? ({ ...custom, name: preset } as QualityPreset)
                  : QUALITY_PRESETS[preset as Exclude<QualityPresetName, "Custom">];
                void applyQualityPreset(qualityPreset).catch(console.error);
              }
            }}
          />
        ) : (
          <div
            style={{
              background: "#1a1a2e",
              border: "1px solid #2a2a4e",
              borderRadius: 6,
              padding: "12px 16px",
              fontSize: 13,
              color: "#ccc",
              lineHeight: 1.8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ color: "#888", fontSize: 12 }}>解像度:</span>
              <select
                value={adaptiveBasePreset}
                onChange={(e) => setAdaptiveBasePreset(e.target.value as Exclude<QualityPresetName, "Custom">)}
                style={{ background: "#2a2a3e", color: "#fff", border: "1px solid #444", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}
              >
                {(["Low", "Balanced", "Sharp", "Ultra"] as const).map((p) => (
                  <option key={p} value={p}>{p} ({QUALITY_PRESETS[p].resolution})</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 6, fontSize: 11, color: "#666" }}>操作状況に応じて FPS・帯域を自動調整します。</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["\u72b6\u614b", "FPS", "\u54c1\u8cea(%)", "\u76ee\u5b89Mbps"].map((h) => (
                    <th key={h} style={{ color: "#666", fontWeight: 400, textAlign: "left", paddingBottom: 4 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["idle", "mouse_moving", "scrolling", "typing", "clicking"] as const).map((s) => (
                  <tr key={s}>
                    <td style={{ color: "#888", paddingRight: 16 }}>{STATE_LABEL[s]}</td>
                    <td style={{ color: "#fff", paddingRight: 16 }}>{pairproProfiles[s].fps}</td>
                    <td style={{ color: "#fff", paddingRight: 16 }}>{pairproProfiles[s].quality}</td>
                    <td style={{ color: "#666" }}>{calcBitrateMbps(pairproProfiles[s].quality, QUALITY_PRESETS[adaptiveBasePreset].width, QUALITY_PRESETS[adaptiveBasePreset].height, pairproProfiles[s].fps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 12 }}>あいことば（任意）</h3>
        <input
          type="text"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          maxLength={100}
          placeholder="未指定ならコードだけで参加できます"
          style={{
            width: "100%",
            padding: "9px 12px",
            background: "#2a2a3e",
            color: "#fff",
            border: "1px solid #444",
            borderRadius: 6,
            fontSize: 14,
            fontFamily: "inherit",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={handleCreateSession}
          disabled={creating || !selectedSourceId}
          style={{
            padding: "12px 24px",
            background: creating || !selectedSourceId ? "#444" : "#4a9eff",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 15,
          }}
        >
          {creating ? "作成中..." : "セッションを作成"}
        </button>
        <button
          onClick={() => navigate("home")}
          style={{ padding: "12px 20px", background: "transparent", color: "#aaa", border: "1px solid #444", borderRadius: 8 }}
        >
          戻る
        </button>
      </div>
    </div>
  );
}
