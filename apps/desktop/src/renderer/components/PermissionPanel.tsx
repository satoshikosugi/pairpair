import React from "react";
import { useSessionStore } from "../store/session-store";
import { dataChannelManager } from "../webrtc/data-channel";

interface PermissionPanelProps {
  role: "host" | "guest";
}

export function PermissionPanel({ role }: PermissionPanelProps): React.ReactElement {
  const { controlState, setControlState, guestDeviceName } = useSessionStore();

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

  if (role === "host") {
    return (
      <div style={{ padding: 12, background: "rgba(0,0,0,0.5)", borderTop: "1px solid #333" }}>
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
      {controlState === "viewOnly" && (
        <button onClick={handleRequestControl} style={btnStyle("#4a9eff")}>
          操作をリクエスト
        </button>
      )}
      {controlState === "controlRequested" && <span style={{ color: "#ffa500" }}>操作リクエスト中...</span>}
      {controlState === "controlAllowed" && <span style={{ color: "#00c851" }}>操作中</span>}
      {controlState === "controlPaused" && <span style={{ color: "#ffa500" }}>操作一時停止中</span>}
      {controlState === "controlRevoked" && <span style={{ color: "#ff4444" }}>操作権限が取り消されました</span>}
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
