import React, { useEffect } from "react";
import { QUALITY_PRESETS } from "@pairpair/shared";
import { useAppStore } from "../store/app-store";
import { useSettingsStore } from "../store/settings-store";
import { getRecentSessionActionLabel, getRecentSessionSummary, isRecentSessionResumable } from "../session-resume";

export function HomePage(): React.ReactElement {
  const { navigate } = useAppStore();
  const { defaultPreset, loadFromElectron, recentSession, setRecentSession } = useSettingsStore();

  useEffect(() => {
    void loadFromElectron();
  }, [loadFromElectron]);

  const preset = defaultPreset !== "Custom" ? QUALITY_PRESETS[defaultPreset as Exclude<typeof defaultPreset, "Custom">] : null;

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
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 36, marginBottom: 8, color: "#4a9eff" }}>PairPair</h1>
        <p style={{ color: "#aaa", fontSize: 14 }}>軽量・高画質なペアプロ用リモート操作アプリ</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 280 }}>
        <button onClick={() => navigate("host-setup")} style={primaryBtnStyle}>
          ホストとして開始
        </button>
        <button onClick={() => navigate("guest-join")} style={secondaryBtnStyle}>
          ゲストとして参加
        </button>
      </div>

      {isRecentSessionResumable(recentSession) && (
        <div style={resumeCardStyle}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ color: "#fff", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>直前のセッション</div>
              <div style={{ color: "#9cb0c8", fontSize: 13, lineHeight: 1.7 }}>
                {getRecentSessionSummary(recentSession)}
                <br />
                {recentSession.role === "host" ? "役割: ホスト" : "役割: ゲスト"} / コード: {recentSession.code}
              </div>
            </div>
            <button onClick={() => void setRecentSession(null)} style={inlineDangerButtonStyle}>
              破棄
            </button>
          </div>
          <button
            onClick={() => navigate(recentSession.role === "host" ? "host-setup" : "guest-join")}
            style={{ ...primaryBtnStyle, marginTop: 14, width: "100%" }}
          >
            {getRecentSessionActionLabel(recentSession)}
          </button>
        </div>
      )}

      {preset && (
        <div style={{ color: "#888", fontSize: 12 }}>
          最近の設定: {preset.resolution} / {preset.fps}fps / {preset.bitrateMbps}Mbps
        </div>
      )}

      <button
        onClick={() => navigate("settings")}
        style={{
          background: "transparent",
          color: "#888",
          border: "1px solid #444",
          padding: "6px 16px",
          borderRadius: 6,
          fontSize: 13,
        }}
      >
        設定
      </button>
    </div>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  padding: "14px 24px",
  background: "#4a9eff",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 16,
  fontWeight: "bold",
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: "14px 24px",
  background: "transparent",
  color: "#4a9eff",
  border: "2px solid #4a9eff",
  borderRadius: 8,
  fontSize: 16,
};

const resumeCardStyle: React.CSSProperties = {
  width: "min(520px, 92vw)",
  padding: 18,
  borderRadius: 14,
  background: "linear-gradient(180deg, rgba(40,57,92,0.92) 0%, rgba(18,28,48,0.94) 100%)",
  border: "1px solid rgba(120, 175, 255, 0.24)",
  boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
};

const inlineDangerButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "transparent",
  color: "#ff9e9e",
  border: "1px solid rgba(255, 120, 120, 0.35)",
  borderRadius: 8,
  fontSize: 12,
};
