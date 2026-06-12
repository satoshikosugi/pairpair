import type { RTCStatsReport, RTCInboundRtpStreamStats } from "../types/rtc-stats";

export interface VideoQualityMetrics {
  timestamp: number;
  bytesReceived: number;
  framesDecoded: number;
  framesDropped: number;
  frameWidth: number;
  frameHeight: number;
  jitter: number;
  packetsLost: number;
  bitrate: number; // calculated from bytesReceived delta
}

let previousBytesReceived = 0;
let previousTimestamp = 0;

/**
 * Extract video quality metrics from RTCPeerConnection.getStats()
 * Call this periodically (e.g., every 1-5 seconds) to collect metrics.
 */
export async function captureVideoQualityMetrics(pc: RTCPeerConnection | null): Promise<VideoQualityMetrics | null> {
  if (!pc) return null;

  try {
    const stats = await pc.getStats();
    let metrics: VideoQualityMetrics | null = null;

    stats.forEach((report) => {
      if (report.type === "inbound-rtp" && (report as any).kind === "video") {
        const inbound = report as any as RTCInboundRtpStreamStats;
        const now = Date.now();
        const timeDelta = (now - previousTimestamp) / 1000; // seconds
        const bytesDelta = inbound.bytesReceived - previousBytesReceived;
        const bitrate = timeDelta > 0 ? (bytesDelta * 8) / timeDelta / 1_000_000 : 0; // Mbps

        metrics = {
          timestamp: now,
          bytesReceived: inbound.bytesReceived,
          framesDecoded: inbound.framesDecoded,
          framesDropped: inbound.framesDropped,
          frameWidth: inbound.frameWidth,
          frameHeight: inbound.frameHeight,
          jitter: inbound.jitter,
          packetsLost: inbound.packetsLost,
          bitrate,
        };

        previousBytesReceived = inbound.bytesReceived;
        previousTimestamp = now;
      }
    });

    return metrics;
  } catch (err) {
    console.warn("Failed to capture video quality metrics:", err);
    return null;
  }
}

/**
 * Start periodic collection of video metrics. Returns stop function.
 */
export function startMetricsCollection(
  pc: RTCPeerConnection | null,
  intervalMs: number = 5000,
): () => void {
  const metrics: VideoQualityMetrics[] = [];

  const interval = setInterval(async () => {
    const m = await captureVideoQualityMetrics(pc);
    if (m) {
      metrics.push(m);
      // Log in structured format for easy parsing
      console.log(
        `[QualityMetrics] ${new Date(m.timestamp).toISOString()} | FD:${m.framesDecoded} DR:${m.framesDropped} BR:${m.bitrate.toFixed(2)}Mbps W:${m.frameWidth}x${m.frameHeight}`,
      );
    }
  }, intervalMs);

  return () => {
    clearInterval(interval);
    // Export collected metrics as JSON
    console.log("[QualityMetrics] Collected data:", JSON.stringify(metrics, null, 2));
  };
}

/**
 * Estimate image sharpness by analyzing video frame edges using Canvas.
 * Higher value = sharper (more high-frequency content).
 * Use periodically to correlate with metrics.
 */
export async function analyzeFrameSharpness(videoEl: HTMLVideoElement): Promise<number | null> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Draw current video frame
    ctx.drawImage(videoEl, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Sobel edge detection approximation
    let edgeEnergy = 0;
    for (let i = 4; i < data.length - 4; i += 4) {
      const gx = Math.abs(data[i - 4] - data[i + 4]);
      const gy = Math.abs(data[i] - data[i + canvas.width * 4]);
      edgeEnergy += Math.sqrt(gx * gx + gy * gy) / 255;
    }

    // Normalize by frame pixel count
    const sharpness = edgeEnergy / ((canvas.width * canvas.height) / 4);
    return Math.min(sharpness * 100, 100); // 0-100 scale
  } catch (err) {
    console.warn("Failed to analyze frame sharpness:", err);
    return null;
  }
}

/**
 * Start periodic frame sharpness analysis.
 */
export function startSharpnessAnalysis(
  videoEl: HTMLVideoElement | null,
  intervalMs: number = 10000,
): () => void {
  if (!videoEl) return () => {};

  const interval = setInterval(async () => {
    const sharpness = await analyzeFrameSharpness(videoEl);
    if (sharpness !== null) {
      console.log(`[SharpnessAnalysis] ${new Date().toISOString()} | Sharpness: ${sharpness.toFixed(1)}/100`);
    }
  }, intervalMs);

  return () => clearInterval(interval);
}
