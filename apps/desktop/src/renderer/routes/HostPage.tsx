import React, { useState, useEffect } from "react";
import type { QualityPresetName, QualityPreset } from "@pairpair/shared";
import { useAppStore } from "../store/app-store";
import { useSessionStore } from "../store/session-store";
import { useSettingsStore } from "../store/settings-store";
import { ScreenSourcePicker } from "../components/ScreenSourcePicker";
import { QualityPresetSelector } from "../components/QualityPresetSelector";
import { signalingClient } from "../webrtc/signaling-client";
import { createPeerConnectionAsHost, applyQualityPreset } from "../webrtc/rtc-client";
import { QUALITY_PRESETS } from "@pairpair/shared";

const SERVER_URL = "http://localhost:8080";

export function HostPage(): React.ReactElement {
  const { navigate, setError } = useAppStore();
  const { setSessionId, setCode, setRole, setExpiresAt, setGuestDeviceName, code, expiresAt } = useSessionStore();
  const { defaultPreset } = useSettingsStore();
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<QualityPresetName>(defaultPreset);
  const [customPreset, setCustomPreset] = useState<Partial<QualityPreset>>({});
  const [creating, setCreating] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!waiting || !expiresAt) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [waiting, expiresAt]);

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
          deviceName: "PairPair Host",
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

      setSessionId(data.sessionId);
      setCode(data.code);
      setRole("host");
      setExpiresAt(data.expiresAt);

      signalingClient.connect(data.wsUrl, data.sessionId, data.hostToken, "host");

      signalingClient.on("guest.joined", (msg) => {
        const guestName = (msg.payload as { guestDeviceName?: string })?.guestDeviceName ?? "Guest";
        setGuestDeviceName(guestName);
        void createPeerConnectionAsHost(selectedSourceId).catch(console.error);
        navigate("host-session");
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
    } catch (err) {
      setError(`セッション作成失敗: ${String(err)}`);
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = () => {
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
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: "0 auto", overflowY: "auto", height: "100%" }}>
      <h2 style={{ marginBottom: 24, color: "#4a9eff" }}>ホストとして開始</h2>

      <div style={{ marginBottom: 24 }}>
        <ScreenSourcePicker onSelect={(src) => setSelectedSourceId(src.id)} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 12 }}>画質設定</h3>
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
