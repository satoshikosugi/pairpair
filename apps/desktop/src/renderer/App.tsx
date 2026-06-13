import React, { useEffect, useState } from "react";
import { useAppStore } from "./store/app-store";
import { useSessionStore } from "./store/session-store";
import { HomePage } from "./routes/HomePage";
import { HostPage } from "./routes/HostPage";
import { GuestPage } from "./routes/GuestPage";
import { SessionPage } from "./routes/SessionPage";
import { SettingsPage } from "./routes/SettingsPage";
import { ErrorPage } from "./routes/ErrorPage";
import { Toast } from "./components/Toast";

export default function App(): React.ReactElement {
  const { currentRoute, navigate, error, setError } = useAppStore();
  const { onSessionEnded, reset } = useSessionStore();
  const [sessionEndedMessage, setSessionEndedMessage] = useState<string | null>(null);

  useEffect(() => {
    onSessionEnded(() => {
      if (useSessionStore.getState().roleSwitchInProgress) {
        return;
      }
      setSessionEndedMessage("接続が切断されました");
      reset();
      navigate("home");
    });
  }, [navigate, onSessionEnded, reset]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {error && currentRoute !== "error" && (
        <div
          style={{
            padding: "10px 16px",
            background: "#c00",
            color: "#fff",
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: "transparent", border: "none", color: "#fff", fontSize: 18, cursor: "pointer" }}
          >
            ×
          </button>
        </div>
      )}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {currentRoute === "home" && <HomePage />}
        {(currentRoute === "host-setup" || currentRoute === "host-waiting") && <HostPage />}
        {currentRoute === "host-session" && <SessionPage />}
        {currentRoute === "guest-join" && <GuestPage />}
        {currentRoute === "guest-session" && <SessionPage />}
        {currentRoute === "settings" && <SettingsPage />}
        {currentRoute === "error" && <ErrorPage />}
      </div>
      {sessionEndedMessage && (
        <Toast
          message={sessionEndedMessage}
          duration={3000}
          onClose={() => setSessionEndedMessage(null)}
        />
      )}
    </div>
  );
}
