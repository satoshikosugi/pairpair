import React from "react";
import { useAppStore } from "../store/app-store";
import { useSessionStore } from "../store/session-store";
import { cleanupSession } from "../webrtc/connection-manager";

export function ErrorPage(): React.ReactElement {
  const { navigate, error, setError } = useAppStore();
  const { iceConnectionState, reset } = useSessionStore();

  const isIceFailure = iceConnectionState === "failed" || iceConnectionState === "disconnected";

  const handleRetry = () => {
    cleanupSession();
    reset();
    setError(null);
    navigate("home");
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: 32,
        gap: 20,
      }}
    >
      <div style={{ fontSize: 40 }}>⚠️</div>
      <h2 style={{ color: "#ff4444" }}>接続エラー</h2>

      {isIceFailure ? (
        <>
          <div style={{ color: "#e0e0e0", textAlign: "center", maxWidth: 400 }}>
            P2P接続を確立できませんでした。
          </div>
          <div
            style={{
              background: "#2a2a3e",
              padding: 16,
              borderRadius: 8,
              maxWidth: 400,
              width: "100%",
            }}
          >
            <div style={{ color: "#aaa", fontSize: 13, marginBottom: 8 }}>考えられる原因:</div>
            <ul style={{ color: "#ccc", fontSize: 13, paddingLeft: 20, lineHeight: 1.8 }}>
              <li>どちらかのネットワークがUDP通信を制限している</li>
              <li>企業ネットワークまたはVPNを利用している</li>
              <li>NAT構成により直接接続できない</li>
              <li>ファイアウォールが通信をブロックしている</li>
            </ul>
          </div>
          <div style={{ color: "#888", fontSize: 12, textAlign: "center" }}>
            PairPairの初期版はP2P限定のため、リレー接続は行いません。
          </div>
        </>
      ) : (
        <div style={{ color: "#e0e0e0", textAlign: "center", maxWidth: 400 }}>
          {error ?? "接続中にエラーが発生しました。"}
        </div>
      )}

      <button
        onClick={handleRetry}
        style={{
          padding: "10px 28px",
          background: "#4a9eff",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontSize: 15,
        }}
      >
        ホーム画面へ戻る
      </button>
    </div>
  );
}
