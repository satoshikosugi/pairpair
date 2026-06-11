import React from "react";
import { useAppStore } from "./store/app-store";
import { HomePage } from "./routes/HomePage";
import { HostPage } from "./routes/HostPage";
import { GuestPage } from "./routes/GuestPage";
import { SessionPage } from "./routes/SessionPage";
import { SettingsPage } from "./routes/SettingsPage";

export default function App(): React.ReactElement {
  const { currentRoute, error, setError } = useAppStore();

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {error && (
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
      </div>
    </div>
  );
}
