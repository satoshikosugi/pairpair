import React from "react";
import type { WebRTCStats } from "../webrtc/stats-monitor";
import { adaptiveQualityController } from "../webrtc/adaptive-quality";

interface StatsOverlayProps {
  stats: WebRTCStats;
  visible: boolean;
  onToggle: () => void;
}

export function StatsOverlay({ stats, visible, onToggle }: StatsOverlayProps): React.ReactElement {
  return (
    <>
      <button
        onClick={onToggle}
        style={{
          position: "fixed",
          top: 8,
          right: 8,
          padding: "4px 8px",
          background: "rgba(0,0,0,0.5)",
          color: "#fff",
          border: "1px solid #444",
          borderRadius: 4,
          fontSize: 11,
          zIndex: 1000,
        }}
      >
        Stats
      </button>
      {visible && (
        <div
          style={{
            position: "fixed",
            top: 36,
            right: 8,
            background: "rgba(0,0,0,0.85)",
            color: "#0f0",
            fontFamily: "monospace",
            fontSize: 11,
            padding: "8px 12px",
            borderRadius: 4,
            zIndex: 1000,
            minWidth: 200,
            lineHeight: 1.6,
          }}
        >
          {stats.codec && <div>Codec: {stats.codec}</div>}
          {stats.resolution && <div>Resolution: {stats.resolution}</div>}
          {stats.fps !== undefined && <div>FPS: {stats.fps.toFixed(1)}</div>}
          {stats.bitrateMbps !== undefined && <div>Bitrate: {stats.bitrateMbps.toFixed(2)} Mbps</div>}
          {stats.rtt !== undefined && <div>RTT: {stats.rtt} ms</div>}
          {stats.packetLoss !== undefined && <div>Packet Loss: {stats.packetLoss.toFixed(2)}%</div>}
          {stats.jitter !== undefined && <div>Jitter: {stats.jitter} ms</div>}
          {stats.framesDropped !== undefined && <div>Frames Dropped: {stats.framesDropped}</div>}
          {stats.encoderImplementation && <div>Encoder: {stats.encoderImplementation}</div>}
          {stats.iceState && <div>ICE: {stats.iceState}</div>}
          {adaptiveQualityController.enabled && (
            <div style={{ color: "#4a9eff" }}>Adaptive: {adaptiveQualityController.state}</div>
          )}
          {(stats.localCandidateType || stats.remoteCandidateType) && (
            <div>
              Candidates: {stats.localCandidateType}/{stats.remoteCandidateType}
            </div>
          )}
        </div>
      )}
    </>
  );
}
