import React, { useEffect } from "react";
import { QUALITY_PRESETS } from "@pairpair/shared";
import { useAppStore } from "../store/app-store";
import { useSettingsStore } from "../store/settings-store";

export function HomePage(): React.ReactElement {
  const { navigate } = useAppStore();
  const { defaultPreset, loadFromElectron } = useSettingsStore();

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
