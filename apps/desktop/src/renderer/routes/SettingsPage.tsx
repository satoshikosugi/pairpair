import React from "react";
import type { QualityPresetName, PairProActivityState } from "@pairpair/shared";
import { calcBitrateMbps } from "@pairpair/shared";
import { useAppStore } from "../store/app-store";
import { useSettingsStore } from "../store/settings-store";
import { normalizeNickname, sanitizeNicknameInput } from "../display-name";

export function SettingsPage(): React.ReactElement {
  const { navigate } = useAppStore();
  const settings = useSettingsStore();

  const handleChange = async (key: string, value: unknown) => {
    await settings.saveToElectron(key, value);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto", height: "100%", overflowY: "auto" }}>
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
        <SettingItem label="シグナリングサーバー">
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
        <SettingItem label="ニックネーム">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <input
              type="text"
              value={settings.nickname}
              onChange={(e) => {
                void handleChange("nickname", sanitizeNicknameInput(e.target.value));
              }}
              placeholder="未設定なら無名"
              maxLength={30}
              style={{ ...inputStyle, width: 220 }}
            />
            <div style={{ color: "#777", fontSize: 11 }}>
              接続相手には {normalizeNickname(settings.nickname)} と表示されます
            </div>
          </div>
        </SettingItem>
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

      <section style={{ marginBottom: 24 }}>
        <h3 style={sectionHeader}>適応品質モード（PairPro）</h3>
        <SettingItem label="デフォルトで有効にする">
          <input
            type="checkbox"
            checked={settings.adaptiveModeEnabled}
            onChange={(e) => {
              void handleChange("adaptiveModeEnabled", e.target.checked);
            }}
          />
        </SettingItem>
        <div style={{ marginTop: 12, background: "#1a1a2e", border: "1px solid #2a2a4e", borderRadius: 6, padding: "12px 16px", fontSize: 12, maxHeight: 600, overflowY: "auto" }}>
          {/* Table header */}
          <div style={{ display: "flex", gap: 12, marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #2a2a4e" }}>
            <div style={{ flex: "0 0 120px", color: "#888", fontSize: 11, fontWeight: "bold" }}>状態</div>
            <div style={{ flex: "0 0 80px", color: "#888", fontSize: 11, fontWeight: "bold" }}>FPS</div>
            <div style={{ flex: 1, color: "#888", fontSize: 11, fontWeight: "bold" }}>品質（スライダー）</div>
            <div style={{ flex: "0 0 100px", color: "#888", fontSize: 11, fontWeight: "bold" }}>目安 Mbps</div>
            <div style={{ flex: "0 0 120px", color: "#888", fontSize: 11, fontWeight: "bold" }}>アイドル時間</div>
          </div>

          {/* Rows for each state */}
          {([
            ["idle",         "アイドル"],
            ["mouse_moving", "マウス移動"],
            ["scrolling",    "スクロール"],
            ["typing",       "タイプ中"],
            ["clicking",     "クリック"],
          ] as [PairProActivityState, string][]).map(([key, label]) => {
            const p = settings.pairproProfiles[key];
            return (
              <div key={key} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #333" }}>
                {/* State label */}
                <div style={{ flex: "0 0 120px", color: "#aaa", fontSize: 11 }}>{label}</div>

                {/* FPS input */}
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={p.fps}
                  onChange={(e) => settings.setPairproProfile(key, { ...p, fps: Number(e.target.value) })}
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
                    value={p.quality}
                    onChange={(e) => settings.setPairproProfile(key, { ...p, quality: Number(e.target.value) })}
                    style={{ flex: 1, accentColor: "#4a9eff", cursor: "pointer" }}
                  />
                  <span style={{ color: "#4a9eff", fontWeight: "bold", fontSize: 11, minWidth: "30px" }}>
                    {p.quality}%
                  </span>
                </div>

                {/* Bitrate estimate */}
                <div style={{ flex: "0 0 100px", color: "#666", fontSize: 11, textAlign: "center" }}>
                  {calcBitrateMbps(p.quality, 1920, 1080, p.fps).toFixed(1)} Mbps
                </div>

                {/* Idle timeout input */}
                <input
                  type="number"
                  min="500"
                  max="15000"
                  step="500"
                  value={p.idleTimeoutMs}
                  onChange={(e) => settings.setPairproProfile(key, { ...p, idleTimeoutMs: Number(e.target.value) })}
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
        <button
          onClick={() => settings.resetPairproProfiles()}
          style={{ marginTop: 8, padding: "4px 12px", background: "#2a2a3e", color: "#aaa", border: "1px solid #444", borderRadius: 4, fontSize: 12, cursor: "pointer" }}
        >
          デフォルトに戻す
        </button>
        <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>
          ※ 変更はセッション再開後に反映されます
        </div>
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
