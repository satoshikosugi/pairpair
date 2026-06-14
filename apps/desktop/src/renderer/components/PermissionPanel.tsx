import React, { useEffect, useState } from "react";
import { getPermissionPreset, type PermissionPresetId } from "@pairpair/shared";
import type { ClipboardHistoryEntry } from "../store/session-store";
import { useSessionStore } from "../store/session-store";
import { dataChannelManager } from "../webrtc/data-channel";

interface PermissionPanelProps {
  role: "host" | "guest";
  onSendClipboardText?: (text: string) => void;
  onPasteClipboardText?: (text: string) => void;
  clipboardHistory?: ClipboardHistoryEntry[];
  onReceiveClipboardText?: (text: string) => void;
  onClearClipboardHistory?: () => void;
}

export function PermissionPanel({
  role,
  onSendClipboardText,
  onPasteClipboardText,
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
  const [collapsed, setCollapsed] = useState(sessionPermissions.clipboard);
  const [expandedEntry, setExpandedEntry] = useState<ClipboardHistoryEntry | null>(null);
  const [latestNotifiedReceivedId, setLatestNotifiedReceivedId] = useState<string | null>(null);
  const [hasUnseenReceived, setHasUnseenReceived] = useState(false);
  const latestRemoteEntry = clipboardHistory.find((entry) => entry.direction === "received");
  const historyCount = clipboardHistory.length;
  const receivedCount = clipboardHistory.filter((entry) => entry.direction === "received").length;

  useEffect(() => {
    if (!latestRemoteEntry || latestRemoteEntry.id === latestNotifiedReceivedId) return;
    setLatestNotifiedReceivedId(latestRemoteEntry.id);
    setHasUnseenReceived(collapsed);
  }, [collapsed, latestNotifiedReceivedId, latestRemoteEntry]);

  useEffect(() => {
    if (!collapsed) {
      setHasUnseenReceived(false);
    }
  }, [collapsed]);

  const collapsedClipboardSummary = collapsed && sessionPermissions.clipboard ? (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginLeft: "auto" }}>
      {hasUnseenReceived && (
        <button
          onClick={() => setCollapsed(false)}
          style={notificationBadgeStyle}
          title="受信履歴を開く"
        >
          受信あり
        </button>
      )}
      <span style={summaryBadgeStyle}>
        履歴 {historyCount} 件
      </span>
      <span style={summaryBadgeStyle}>
        受信 {receivedCount} 件
      </span>
    </div>
  ) : null;

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

  const readClipboardText = async (): Promise<string> => {
    return navigator.clipboard.readText();
  };

  const handleSendClipboard = () => {
    void readClipboardText().then((text) => {
      if (!text.trim()) {
        setClipboardStatus("ローカルクリップボードに送信できるテキストがありません");
        return;
      }
      onSendClipboardText?.(text);
      setClipboardStatus("ローカルクリップボードのテキストを共有しました");
    }).catch(() => {
      setClipboardStatus("クリップボードの読み取りに失敗しました");
    });
  };

  const handlePasteClipboard = () => {
    void readClipboardText().then((text) => {
      if (!text.trim()) {
        setClipboardStatus("ローカルクリップボードに貼り付けできるテキストがありません");
        return;
      }
      onPasteClipboardText?.(text);
      setClipboardStatus("ローカルクリップボードのテキストを相手へ貼り付けました");
    }).catch(() => {
      setClipboardStatus("クリップボードの読み取りに失敗しました");
    });
  };

  const renderClipboardSection = (options: { showPasteButton: boolean; helperText: string }): React.ReactElement | null => {
    if (!sessionPermissions.clipboard) return null;

    return (
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ color: "#9cb0c8", fontSize: 12, lineHeight: 1.6 }}>
          {options.helperText}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {onSendClipboardText && (
            <button onClick={handleSendClipboard} style={btnStyle("#4a9eff")}>
              送る
            </button>
          )}
          {options.showPasteButton && onPasteClipboardText && (
            <button onClick={handlePasteClipboard} style={btnStyle("#2fb36d")}>
              貼り付け
            </button>
          )}
          {latestRemoteEntry && onReceiveClipboardText && (
            <button
              onClick={() => {
                onReceiveClipboardText(latestRemoteEntry.text);
                setClipboardStatus("最新の受信スニペットをローカルクリップボードへコピーしました");
              }}
              style={secondaryButtonStyle}
            >
              受け取る
            </button>
          )}
          {onClearClipboardHistory && (
            <button onClick={onClearClipboardHistory} style={secondaryButtonStyle}>
              履歴を消去
            </button>
          )}
          {options.showPasteButton && (
            <span style={{ color: "#9cb0c8", fontSize: 12 }}>
              Ctrl+V / Command+V / Shift+Insert でも相手へ貼り付けできます
            </span>
          )}
        </div>
        {clipboardStatus && <span style={{ color: "#888", fontSize: 12 }}>{clipboardStatus}</span>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ color: "#9cb0c8", fontSize: 12 }}>スニペット履歴</div>
          <div style={historyListStyle}>
            {clipboardHistory.length === 0 ? (
              <div style={{ color: "#6f7f96", fontSize: 12 }}>まだ送受信履歴はありません</div>
            ) : (
              clipboardHistory.map((entry) => {
                const truncated = isSnippetTruncated(entry.text);
                return (
                  <div key={entry.id} style={historyItemStyle}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ color: entry.direction === "sent" ? "#9fd3ff" : "#b9f5c8", fontSize: 11 }}>
                        {entry.direction === "sent" ? "送信" : "受信"} / {entry.peerRole === "host" ? "ホスト" : "ゲスト"}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {truncated && (
                          <button onClick={() => setExpandedEntry(entry)} style={smallButtonStyle}>
                            全文
                          </button>
                        )}
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
                    </div>
                    <div style={historyPreviewStyle}>
                      {renderSnippetPreview(entry.text)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  if (role === "host") {
    return (
      <div style={{ padding: 12, background: "rgba(0,0,0,0.5)", borderTop: "1px solid #333" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: collapsed ? 0 : 10,
          }}
        >
          <div style={{ color: "#9cb0c8", fontSize: 12 }}>
            現在の権限: {getPermissionPreset(permissionPresetId).label}
          </div>
          {collapsedClipboardSummary}
          <button
            onClick={() => setCollapsed((current) => !current)}
            style={collapseButtonStyle}
            aria-label={collapsed ? "下部パネルを展開" : "下部パネルを折りたたむ"}
            title={collapsed ? "展開" : "折りたたむ"}
          >
            {collapsed ? "開く" : "閉じる"}
          </button>
        </div>
        {collapsed ? null : (
          <>
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
            {renderClipboardSection({
              showPasteButton: false,
              helperText: "「送る」はローカルクリップボードのテキストを相手へ共有します。「受け取る」は直近の受信内容または履歴項目をローカルクリップボードへコピーします。",
            })}
          </>
        )}
      </div>
    );
  }

  return (
    <>
    <div style={{ padding: 12, background: "rgba(0,0,0,0.5)", borderTop: "1px solid #333" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: collapsed ? 0 : 6,
        }}
      >
        <div style={{ color: "#9cb0c8", fontSize: 12 }}>
          現在の権限: {getPermissionPreset(permissionPresetId).label}
        </div>
        {collapsedClipboardSummary}
        <button
          onClick={() => setCollapsed((current) => !current)}
          style={collapseButtonStyle}
          aria-label={collapsed ? "下部パネルを展開" : "下部パネルを折りたたむ"}
          title={collapsed ? "展開" : "折りたたむ"}
        >
          {collapsed ? "開く" : "閉じる"}
        </button>
      </div>
      {collapsed ? null : (
        <>
      {(controlState === "viewOnly" || controlState === "controlRequested") && (
        <span style={{ color: "#888", fontSize: 13 }}>
          {sessionPermissions.mouseMove || sessionPermissions.mouseClick || sessionPermissions.mouseWheel || sessionPermissions.keyboard
            ? sessionPermissions.annotation
              ? sessionPermissions.clipboard
                ? "画面をクリックして操作を開始。マーカー注釈とクリップボード共有も利用できます"
                : "画面をクリックして操作を開始。マーカー注釈も利用できます"
              : sessionPermissions.clipboard
                ? "画面をクリックして操作を開始。クリップボード共有も利用できます"
                : "画面をクリックして操作を開始"
            : sessionPermissions.clipboard
              ? "ローカルクリップボードの共有と受け取りが利用できます"
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
      {renderClipboardSection({
        showPasteButton: true,
        helperText: "「送る」はローカルクリップボードのテキストを相手へ共有します。「貼り付け」はその内容を相手のアクティブ入力先へ送ります。",
      })}
        </>
      )}
    </div>
    {expandedEntry && (
      <div style={modalBackdropStyle} onClick={() => setExpandedEntry(null)}>
        <div style={modalPanelStyle} onClick={(event) => event.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>
                {expandedEntry.direction === "sent" ? "送信" : "受信"} / {expandedEntry.peerRole === "host" ? "ホスト" : "ゲスト"}
              </div>
              <div style={{ color: "#9cb0c8", fontSize: 12, marginTop: 4 }}>
                全文表示
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => {
                  if (!onReceiveClipboardText) return;
                  onReceiveClipboardText(expandedEntry.text);
                  setClipboardStatus("選択したスニペットをローカルクリップボードへコピーしました");
                }}
                style={smallButtonStyle}
              >
                受け取る
              </button>
              <button onClick={() => setExpandedEntry(null)} style={secondaryButtonStyle}>
                閉じる
              </button>
            </div>
          </div>
          <pre style={modalContentStyle}>{expandedEntry.text}</pre>
        </div>
      </div>
    )}
    </>
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

function isSnippetTruncated(value: string): boolean {
  return value.length > 180 || value.split(/\r?\n/).length > 3;
}

function renderSnippetPreview(value: string): string {
  const lines = value.split(/\r?\n/);
  const preview = lines.slice(0, 3).join("\n");
  if (lines.length > 3) {
    return `${truncate(preview, 180)}...`;
  }
  return truncate(preview, 180);
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

const historyItemStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const historyListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  maxHeight: 280,
  overflowY: "auto",
  paddingRight: 4,
};

const historyPreviewStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: 12,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const collapseButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  background: "rgba(255,255,255,0.06)",
  color: "#d7dde8",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 999,
  fontSize: 11,
};

const summaryBadgeStyle: React.CSSProperties = {
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 11,
  color: "#d7dde8",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
};

const notificationBadgeStyle: React.CSSProperties = {
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 11,
  color: "#fff1dc",
  background: "rgba(255, 140, 66, 0.22)",
  border: "1px solid rgba(255, 166, 77, 0.34)",
  fontWeight: 700,
  cursor: "pointer",
};

const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.72)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1200,
  padding: 24,
};

const modalPanelStyle: React.CSSProperties = {
  width: "min(960px, 100%)",
  maxHeight: "80vh",
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: 20,
  borderRadius: 14,
  background: "#101826",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
};

const modalContentStyle: React.CSSProperties = {
  margin: 0,
  padding: 16,
  borderRadius: 10,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#fff",
  fontSize: 13,
  lineHeight: 1.6,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  flex: 1,
};
