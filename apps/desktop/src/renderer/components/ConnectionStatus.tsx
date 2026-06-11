import React from "react";
import { useSessionStore } from "../store/session-store";

export function ConnectionStatus(): React.ReactElement {
  const { connectionState, iceConnectionState } = useSessionStore();

  const statusColor =
    {
      idle: "#888",
      connecting: "#ffa500",
      connected: "#00c851",
      disconnected: "#ff4444",
      failed: "#ff0000",
    }[connectionState] ?? "#888";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: statusColor,
        }}
      />
      <span>
        {connectionState === "connected"
          ? `P2P接続済み (ICE: ${iceConnectionState})`
          : connectionState === "connecting"
            ? "接続中..."
            : connectionState === "disconnected"
              ? "切断"
              : connectionState === "failed"
                ? "接続失敗"
                : "未接続"}
      </span>
    </div>
  );
}
