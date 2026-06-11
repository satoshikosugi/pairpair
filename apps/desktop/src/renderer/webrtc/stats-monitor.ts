import { getPeerConnection } from "./rtc-client";

export interface WebRTCStats {
  rtt?: number;
  fps?: number;
  bitrateMbps?: number;
  packetLoss?: number;
  resolution?: string;
  codec?: string;
  encoderImplementation?: string;
  jitter?: number;
  framesDropped?: number;
  iceState?: string;
  localCandidateType?: string;
  remoteCandidateType?: string;
}

let statsInterval: ReturnType<typeof setInterval> | null = null;
let onStatsUpdate: ((stats: WebRTCStats) => void) | null = null;
let lastBytesReceived = 0;
let lastBytesSent = 0;
let lastStatsTime = 0;

export function startStatsMonitor(callback: (stats: WebRTCStats) => void): void {
  onStatsUpdate = callback;
  stopStatsMonitor();
  statsInterval = setInterval(() => {
    void collectStats();
  }, 1000);
}

export function stopStatsMonitor(): void {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}

async function collectStats(): Promise<void> {
  const pc = getPeerConnection();
  if (!pc || !onStatsUpdate) return;

  try {
    const reports = await pc.getStats();
    const stats: WebRTCStats = {};
    const now = Date.now();
    const dt = lastStatsTime ? (now - lastStatsTime) / 1000 : 1;
    lastStatsTime = now;

    reports.forEach((report) => {
      if (report.type === "inbound-rtp" && (report as RTCInboundRtpStreamStats).kind === "video") {
        const r = report as RTCInboundRtpStreamStats & {
          framesPerSecond?: number;
          frameWidth?: number;
          frameHeight?: number;
          framesDropped?: number;
          jitter?: number;
          packetsLost?: number;
          packetsReceived?: number;
          bytesReceived?: number;
        };
        stats.fps = r.framesPerSecond;
        if (r.frameWidth && r.frameHeight) {
          stats.resolution = `${r.frameWidth}x${r.frameHeight}`;
        }
        stats.framesDropped = r.framesDropped;
        stats.jitter = r.jitter ? Math.round(r.jitter * 1000) : undefined;
        if (r.packetsLost !== undefined && r.packetsReceived !== undefined) {
          const total = r.packetsLost + r.packetsReceived;
          stats.packetLoss = total > 0 ? (r.packetsLost / total) * 100 : 0;
        }
        if (r.bytesReceived !== undefined) {
          const bytesDelta = r.bytesReceived - lastBytesReceived;
          stats.bitrateMbps = (bytesDelta * 8) / dt / 1_000_000;
          lastBytesReceived = r.bytesReceived;
        }
      }

      if (report.type === "outbound-rtp" && (report as RTCOutboundRtpStreamStats).kind === "video") {
        const r = report as RTCOutboundRtpStreamStats & {
          bytesSent?: number;
          encoderImplementation?: string;
        };
        if (r.bytesSent !== undefined) {
          const bytesDelta = r.bytesSent - lastBytesSent;
          stats.bitrateMbps = (bytesDelta * 8) / dt / 1_000_000;
          lastBytesSent = r.bytesSent;
        }
        stats.encoderImplementation = r.encoderImplementation;
      }

      if (report.type === "codec") {
        const r = report as RTCCodecStats & { mimeType?: string };
        if (r.mimeType) {
          stats.codec = r.mimeType.replace("video/", "");
        }
      }

      if (report.type === "candidate-pair" && (report as RTCIceCandidatePairStats).state === "succeeded") {
        const r = report as RTCIceCandidatePairStats & { currentRoundTripTime?: number };
        if (r.currentRoundTripTime !== undefined) {
          stats.rtt = Math.round(r.currentRoundTripTime * 1000);
        }
      }

      if (report.type === "local-candidate") {
        stats.localCandidateType = (report as RTCIceCandidateStats).candidateType;
      }

      if (report.type === "remote-candidate") {
        stats.remoteCandidateType = (report as RTCIceCandidateStats).candidateType;
      }
    });

    stats.iceState = pc.iceConnectionState;
    onStatsUpdate(stats);
  } catch (err) {
    console.warn("Failed to collect WebRTC stats:", err);
  }
}
