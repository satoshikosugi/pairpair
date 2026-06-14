import React, { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/app-store";
import { useSessionStore } from "../store/session-store";
import { useSettingsStore } from "../store/settings-store";
import { signalingClient } from "../webrtc/signaling-client";
import { createPeerConnectionAsGuest, handleOffer, handleIce } from "../webrtc/rtc-client";
import { guestPeerAuthenticator } from "../webrtc/peer-auth";
import { getRecentSessionSummary, isRecentSessionResumable } from "../session-resume";

const SERVER_URL = "https://pairpair-signaling-server-245497898064.asia-northeast1.run.app";

export function GuestPage(): React.ReactElement {
  const { navigate, setError } = useAppStore();
  const { recentSession, setRecentSession } = useSettingsStore();
  const {
    setSessionId,
    setCode: setSessionCode,
    setRole,
    setHostDeviceName,
    setSignalingUrl,
    setGuestToken,
    setHostToken,
  } = useSessionStore();
  const [code, setCode] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [requiresPassphrase, setRequiresPassphrase] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const passphraseInputRef = useRef<HTMLInputElement>(null);
  const showResumeCard =
    isRecentSessionResumable(recentSession) &&
    recentSession.role === "guest" &&
    !connecting &&
    !requiresPassphrase &&
    code.trim().length === 0;

  useEffect(() => {
    if (requiresPassphrase) {
      passphraseInputRef.current?.focus();
    } else {
      codeInputRef.current?.focus();
    }
  }, [requiresPassphrase]);

  const saveRecentGuestSession = async (params: {
    hostName: string;
    requiresSecret: boolean;
  }) => {
    await setRecentSession({
      version: 1,
      role: "guest",
      hostDeviceName: params.hostName,
      guestDeviceName: "PairPair Guest",
      sourceName: null,
      sourceDisplayId: null,
      requiresPassphrase: params.requiresSecret,
      savedAt: Date.now(),
    });
  };

  const handleConnect = async () => {
    const cleanCode = code.replace(/\s/g, "");
    if (!/^\d{6,8}$/.test(cleanCode)) {
      setError("6〜8桁の数字を入力してください");
      return;
    }

    setConnecting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/sessions/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: cleanCode,
          appVersion: "0.1.0",
          deviceName: "PairPair Guest",
          platform: window.pairpair.platform,
        }),
      });

      if (res.status === 404) throw new Error("コードが見つかりません（期限切れか無効）");
      if (res.status === 409) throw new Error("このコードは既に使用されています");
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(`接続エラー: ${errorData.error || res.statusText}`);
      }

      const data = (await res.json()) as { sessionId: string; guestToken: string; hostDeviceName: string; wsUrl: string };

      setSessionId(data.sessionId);
      setSessionCode(cleanCode);
      setRole("guest");
      setHostDeviceName(data.hostDeviceName);
      setSignalingUrl(data.wsUrl);
      setGuestToken(data.guestToken);
      setHostToken(null);
      await saveRecentGuestSession({
        hostName: data.hostDeviceName,
        requiresSecret: false,
      });

      signalingClient.connect(data.wsUrl, data.sessionId, data.guestToken, "guest");

      await createPeerConnectionAsGuest();
      guestPeerAuthenticator.start(
        cleanCode,
        () => {
          setRequiresPassphrase(true);
          void saveRecentGuestSession({
            hostName: data.hostDeviceName,
            requiresSecret: true,
          });
        },
        () => {
          void saveRecentGuestSession({
            hostName: data.hostDeviceName,
            requiresSecret: requiresPassphrase || passphrase.length > 0,
          });
          navigate("guest-session");
        },
        (reason) => {
          if (reason === "invalid_passphrase") {
            setPassphrase("");
            setRequiresPassphrase(true);
            setError("あいことばが一致しません");
          } else {
            setError(`P2P認証に失敗しました: ${reason}`);
          }
        },
      );

      signalingClient.on("rtc.offer", (msg) => {
        const sdp = (msg.payload as { sdp?: string })?.sdp ?? "";
        void handleOffer(sdp).catch(console.error);
      });

      signalingClient.on("rtc.ice", (msg) => {
        const payload = msg.payload as { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
        void handleIce(payload.candidate ?? "", payload.sdpMid ?? null, payload.sdpMLineIndex ?? null).catch(console.error);
      });

    } catch (err) {
      setError(String(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleReuseSettings = () => {
    if (!isRecentSessionResumable(recentSession) || recentSession.role !== "guest") {
      setError("前回設定が見つかりません");
      return;
    }
    setCode("");
    setPassphrase("");
    setRequiresPassphrase(false);
    codeInputRef.current?.focus();
  };

  const handleSubmitPassphrase = async () => {
    if (!passphrase) {
      setError("あいことばを入力してください");
      return;
    }
    setConnecting(true);
    try {
      await guestPeerAuthenticator.submitPassphrase(passphrase);
    } catch (err) {
      setError(`P2P認証開始失敗: ${String(err)}`);
    } finally {
      setConnecting(false);
    }
  };

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
      <h2 style={{ color: "#4a9eff" }}>ゲストとして参加</h2>
      <p style={{ color: "#aaa", fontSize: 14, textAlign: "center", maxWidth: 300 }}>
        ホストから共有されたコードを入力してください
      </p>

      {showResumeCard && (
        <div style={resumeCardStyle}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ color: "#fff", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>直前のゲストセッション</div>
              <div style={{ color: "#9cb0c8", fontSize: 13, lineHeight: 1.7 }}>
                {getRecentSessionSummary(recentSession)}
                {recentSession.requiresPassphrase && (
                  <>
                    <br />
                    前回はあいことば付きでした。新しいコードで接続後に再入力します。
                  </>
                )}
              </div>
            </div>
            <button onClick={() => void setRecentSession(null)} style={inlineDangerButtonStyle}>
              破棄
            </button>
          </div>
          <button
            onClick={() => {
              handleReuseSettings();
            }}
            disabled={connecting}
            style={{ ...primaryActionButtonStyle, marginTop: 14, opacity: connecting ? 0.6 : 1 }}
          >
            新しいコードを入力する
          </button>
        </div>
      )}

      <input
        ref={codeInputRef}
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, ""))}
        placeholder="123456"
        maxLength={8}
        style={{
          padding: "12px 20px",
          fontSize: 24,
          textAlign: "center",
          letterSpacing: 8,
          background: "#2a2a3e",
          border: "2px solid #444",
          color: "#fff",
          borderRadius: 8,
          width: 200,
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void handleConnect();
        }}
      />

      {requiresPassphrase && (
        <input
          ref={passphraseInputRef}
          type="text"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="あいことば"
          maxLength={100}
          style={{
            width: 220,
            padding: "10px 14px",
            fontSize: 16,
            background: "#2a2a3e",
            border: "2px solid #444",
            color: "#fff",
            borderRadius: 8,
            fontFamily: "inherit",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSubmitPassphrase();
          }}
        />
      )}

      <button
        onClick={() => {
          void (requiresPassphrase ? handleSubmitPassphrase() : handleConnect());
        }}
        disabled={connecting}
        style={{
          padding: "12px 32px",
          background: connecting ? "#444" : "#4a9eff",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontSize: 16,
        }}
      >
        {connecting ? "接続中..." : requiresPassphrase ? "あいことばを照合" : "接続"}
      </button>

      <div style={{ color: "#888", fontSize: 12, textAlign: "center" }}>
        接続方式: P2P限定
        <br />※ネットワーク環境によっては接続できません
      </div>

      <button onClick={() => navigate("home")} style={{ background: "transparent", color: "#aaa", border: "none", fontSize: 13 }}>
        戻る
      </button>
    </div>
  );
}

const resumeCardStyle: React.CSSProperties = {
  width: "min(520px, 92vw)",
  padding: 18,
  borderRadius: 14,
  background: "linear-gradient(180deg, rgba(40,57,92,0.92) 0%, rgba(18,28,48,0.94) 100%)",
  border: "1px solid rgba(120, 175, 255, 0.24)",
  boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
};

const primaryActionButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#4a9eff",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 700,
};

const inlineDangerButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "transparent",
  color: "#ff9e9e",
  border: "1px solid rgba(255, 120, 120, 0.35)",
  borderRadius: 8,
  fontSize: 12,
};
