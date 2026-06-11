import React from "react";
import type { QualityPresetName } from "@pairpair/shared";
import { useAppStore } from "../store/app-store";
import { useSettingsStore } from "../store/settings-store";

export function SettingsPage(): React.ReactElement {
  const { navigate } = useAppStore();
  const settings = useSettingsStore();

  const handleChange = async (key: string, value: unknown) => {
    await settings.saveToElectron(key, value);
  };

  return (
    <div style={{ padding: 24, maxWidth: 500, margin: "0 auto", height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate("home")} style={{ background: "transparent", color: "#aaa", border: "none", fontSize: 20 }}>
          ←
        </button>
        <h2 style={{ color: "#4a9eff" }}>設定</h2>
      </div>

      <section style={{ marginBottom: 24 }}>
        <h3 style={sectionHeader}>画質</h3>
        <SettingItem label="デフォルトプリセット">
          <select
            value={settings.defaultPreset}
            onChange={(e) => {
              void handleChange("defaultPreset", e.target.value as QualityPresetName);
            }}
            style={selectStyle}
          >
            {["Low", "Balanced", "Sharp", "Ultra", "Custom"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </SettingItem>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={sectionHeader}>接続</h3>
        <SettingItem label="STUNサーバー">
          <input
            type="text"
            value={settings.stunServer}
            onChange={(e) => {
              void handleChange("stunServer", e.target.value);
            }}
            style={{ ...inputStyle, width: 280 }}
          />
        </SettingItem>
        <SettingItem label="接続タイムアウト (秒)">
          <input
            type="number"
            value={settings.connectionTimeout}
            onChange={(e) => {
              void handleChange("connectionTimeout", Number(e.target.value));
            }}
            style={{ ...inputStyle, width: 80 }}
          />
        </SettingItem>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={sectionHeader}>一般</h3>
        <SettingItem label="終了時に確認する">
          <input
            type="checkbox"
            checked={settings.confirmOnExit}
            onChange={(e) => {
              void handleChange("confirmOnExit", e.target.checked);
            }}
          />
        </SettingItem>
        <SettingItem label="ログ保存">
          <input
            type="checkbox"
            checked={settings.logEnabled}
            onChange={(e) => {
              void handleChange("logEnabled", e.target.checked);
            }}
          />
        </SettingItem>
        <SettingItem label="操作前に毎回確認">
          <input
            type="checkbox"
            checked={settings.requirePermissionConfirm}
            onChange={(e) => {
              void handleChange("requirePermissionConfirm", e.target.checked);
            }}
          />
        </SettingItem>
      </section>
    </div>
  );
}

function SettingItem({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 0",
        borderBottom: "1px solid #2a2a3e",
      }}
    >
      <span style={{ color: "#ccc", fontSize: 14 }}>{label}</span>
      {children}
    </div>
  );
}

const sectionHeader: React.CSSProperties = {
  fontSize: 13,
  color: "#888",
  marginBottom: 8,
  textTransform: "uppercase",
  letterSpacing: 1,
};
const selectStyle: React.CSSProperties = {
  background: "#2a2a3e",
  color: "#fff",
  border: "1px solid #444",
  padding: "4px 8px",
  borderRadius: 4,
};
const inputStyle: React.CSSProperties = {
  background: "#2a2a3e",
  color: "#fff",
  border: "1px solid #444",
  padding: "4px 8px",
  borderRadius: 4,
};
