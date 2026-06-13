import React, { useState } from "react";
import { getPermissionPreset, type PermissionPresetId, type TextInputEvent } from "@pairpair/shared";
import type { ClipboardHistoryEntry } from "../store/session-store";
import { useSessionStore } from "../store/session-store";
import { dataChannelManager } from "../webrtc/data-channel";

interface PermissionPanelProps {
  role: "host" | "guest";
  onSendClipboardText?: (text: string) => void;
  clipboardHistory?: ClipboardHistoryEntry[];
  onReceiveClipboardText?: (text: string) => void;
  onClearClipboardHistory?: () => void;
}

export function PermissionPanel({
  role,
  onSendClipboardText,
  clipboardHistory = [],
  onReceiveClipboardText,
  onClearClipboardHistory,
}: PermissionPanelProps): React.ReactElement {
  const {
    controlState,
    setControlState,
    guestDeviceName,
    permissionPresetId,
    sessionPermissions,
    setPermissionPreset,
  } = useSessionStore();
  const presets: PermissionPresetId[] = ["viewOnly", "pointerOnly", "pointerAndClick", "clipboardOnly", "noKeyboard", "annotationOnly", "fullControl"];
  const [clipboardStatus, setClipboardStatus] = useState<string | null>(null);

  const handleGrantControl = () => {
    setControlState("controlAllowed");
    dataChannelManager.sendControl({ type: "remoteControl.granted" });
  };

  const handlePauseControl = () => {
    setControlState("controlPaused");
    dataChannelManager.sendControl({ type: "remoteControl.paused" });
  };

  const handleRevokeControl = () => {
    setControlState("controlRevoked");
    dataChannelManager.sendControl({ type: "remoteControl.revoked" });
  };

  const handleRequestControl = () => {
    setControlState("controlRequested");
    dataChannelManager.sendControl({ type: "remoteControl.request" });
  };

  const handleSetPreset = (presetId: PermissionPresetId) => {
    const preset = getPermissionPreset(presetId);
    setPermissionPreset(presetId, preset.permissions);
    dataChannelManager.sendControl({
      type: "permission.profile.updated",
      presetId,
      permissions: preset.permissions,
    });
    if (presetId === "viewOnly" || presetId === "clipboardOnly" || presetId === "annotationOnly") {
      setControlState("viewOnly");
    }
  };

  if (role === "host") {
    return (
      <div style={{ padding: 12, background: "rgba(0,0,0,0.5)", borderTop: "1px solid #333" }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#9cb0c8", fontSize: 12, marginBottom: 6 }}>権限プリセット</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {presets.map((presetId) => {
              const preset = getPermissionPreset(presetId);
              return (
                <button
                  key={presetId}
                  onClick={() => handleSetPreset(presetId)}
                  title={preset.summary}
                  style={presetButtonStyle(permissionPresetId === presetId)}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
        {controlState === "controlRequested" && (
          <div style={{ marginBottom: 8, color: "#ffa500" }}>
            {guestDeviceName ?? "Guest"} が操作をリクエストしています
          </div>
        )}
        {controlState === "controlAllowed" && (
          <div style={{ marginBottom: 8, color: "#00c851" }}>{guestDeviceName ?? "Guest"} が操作中</div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          {controlState === "controlRequested" && (
            <button onClick={handleGrantControl} style={btnStyle("#00c851")}>
              操作を許可
            </button>
          )}
          {controlState === "controlAllowed" && (
            <>
              <button onClick={handlePauseControl} style={btnStyle("#ffa500")}>
                一時停止
              </button>
              <button onClick={handleRevokeControl} style={btnStyle("#ff4444")}>
                操作権限を取り消す
              </button>
            </>
          )}
          {(controlState === "controlPaused" || controlState === "controlRevoked") && (
            <button onClick={handleGrantControl} style={btnStyle("#4a9eff")}>
              操作を再許可
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 12, background: "rgba(0,0,0,0.5)", borderTop: "1px solid #333" }}>
      <div style={{ color: "#9cb0c8", fontSize: 12, marginBottom: 6 }}>
        現在の権限: {getPermissionPreset(permissionPresetId).label}
      </div>
      {(controlState === "viewOnly" || controlState === "controlRequested") && (
        <span style={{ color: "#888", fontSize: 13 }}>
          {sessionPermissions.mouseMove || sessionPermissions.mouseClick || sessionPermissions.mouseWheel || sessionPermissions.keyboard
            ? sessionPermissions.annotation
              ? "画面をクリックして操作を開始。マーカー注釈も利用できます"
              : "画面をクリックして操作を開始"
            : sessionPermissions.clipboard
              ? "ローカルクリップボードのテキスト送信が利用できます"
            : sessionPermissions.annotation
              ? "マーカー注釈は利用できます"
              : "ホストが現在のセッション権限を制限しています"}
        </span>
      )}
      {controlState === "controlAllowed" && <span style={{ color: "#00c851" }}>操作中</span>}
      {controlState === "controlPaused" && <span style={{ color: "#ffa500" }}>操作一時停止中（ホストが再開するまで待機）</span>}
      {controlState === "controlRevoked" && <span style={{ color: "#ff4444" }}>操作権限が取り消されました</span>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        <PermissionChip label="移動" enabled={sessionPermissions.mouseMove} />
        <PermissionChip label="クリック" enabled={sessionPermissions.mouseClick} />
        <PermissionChip label="ホイール" enabled={sessionPermissions.mouseWheel} />
        <PermissionChip label="キー入力" enabled={sessionPermissions.keyboard} />
        <PermissionChip label="クリップボード" enabled={sessionPermissions.clipboard} />
        <PermissionChip label="注釈" enabled={sessionPermissions.annotation} />
      </div>
      {sessionPermissions.clipboard && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {onSendClipboardText && (
              <button
                onClick={() => {
                  void navigator.clipboard.readText().then((text) => {
                    if (!text.trim()) {
                      setClipboardStatus("ローカルクリップボードに送信できるテキストがありません");
                      return;
                    }
                    onSendClipboardText(text);
                    setClipboardStatus("ローカルクリップボードのテキストを送信しました");
                  }).catch(() => {
                    setClipboardStatus("クリップボードの読み取りに失敗しました");
                  });
                }}
                style={btnStyle("#4a9eff")}
              >
                送る
              </button>
            )}
            {onClearClipboardHistory && (
              <button onClick={onClearClipboardHistory} style={secondaryButtonStyle}>
                履歴を消去
              </button>
            )}
            <span style={modeBadgeStyle}>自動同期 OFF</span>
            <span style={{ color: "#9cb0c8", fontSize: 12 }}>
              Ctrl+V / Command+V でもテキスト送信できます
            </span>
          </div>
          {clipboardStatus && <span style={{ color: "#888", fontSize: 12 }}>{clipboardStatus}</span>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ color: "#9cb0c8", fontSize: 12 }}>スニペット履歴</div>
            {clipboardHistory.length === 0 ? (
              <div style={{ color: "#6f7f96", fontSize: 12 }}>まだ送受信履歴はありません</div>
            ) : (
              clipboardHistory.map((entry) => (
                <div key={entry.id} style={historyItemStyle}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ color: entry.direction === "sent" ? "#9fd3ff" : "#b9f5c8", fontSize: 11 }}>
                      {entry.direction === "sent" ? "送信" : "受信"} / {entry.peerRole === "host" ? "ホスト" : "ゲスト"}
                    </span>
                    <button
                      onClick={() => {
                        if (!onReceiveClipboardText) return;
                        onReceiveClipboardText(entry.text);
                        setClipboardStatus("選択したスニペットをローカルクリップボードへコピーしました");
                      }}
                      style={smallButtonStyle}
                    >
                      受け取る
                    </button>
                  </div>
                  <div style={{ color: "#fff", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {truncate(entry.text, 180)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: "6px 14px",
    background: color,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 13,
  };
}

function presetButtonStyle(selected: boolean): React.CSSProperties {
  return {
    padding: "6px 10px",
    background: selected ? "#4a9eff" : "rgba(255,255,255,0.06)",
    color: "#fff",
    border: selected ? "1px solid #7cc1ff" : "1px solid rgba(255,255,255,0.12)",
    borderRadius: 999,
    fontSize: 12,
  };
}

function PermissionChip({ label, enabled }: { label: string; enabled: boolean }): React.ReactElement {
  return (
    <span
      style={{
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        color: enabled ? "#dff7e8" : "#d7dde8",
        background: enabled ? "rgba(0, 200, 81, 0.18)" : "rgba(255,255,255,0.08)",
        border: enabled ? "1px solid rgba(0, 200, 81, 0.28)" : "1px solid rgba(255,255,255,0.12)",
      }}
    >
      {label}: {enabled ? "ON" : "OFF"}
    </span>
  );
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  fontSize: 12,
};

const smallButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  background: "rgba(76, 201, 240, 0.14)",
  color: "#fff",
  border: "1px solid rgba(76, 201, 240, 0.28)",
  borderRadius: 999,
  fontSize: 11,
};

const modeBadgeStyle: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 999,
  background: "rgba(255, 209, 102, 0.14)",
  color: "#ffe7a8",
  border: "1px solid rgba(255, 209, 102, 0.24)",
  fontSize: 11,
  fontWeight: 700,
};

const historyItemStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
};
