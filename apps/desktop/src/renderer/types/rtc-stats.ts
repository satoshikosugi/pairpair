/**
 * WebRTC Stats API type definitions (simplified for our use case)
 */

export interface RTCInboundRtpStreamStats extends RTCStats {
  type: "inbound-rtp";
  kind: "video" | "audio";
  trackId?: string;
  transportId?: string;
  codecId?: string;
  packetsReceived: number;
  packetsLost: number;
  jitter: number;
  bytesReceived: number;
  framesDecoded: number;
  framesDropped: number;
  frameWidth: number;
  frameHeight: number;
  framesPerSecond?: number;
  estimatedPlayoutTimestamp?: number;
}

export interface RTCStats {
  timestamp: number;
  type: string;
  id: string;
}

export type RTCStatsReport = Map<string, RTCStats>;
