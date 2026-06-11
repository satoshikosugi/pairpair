export interface RemoteControlRequestMessage {
  type: "remoteControl.request";
}

export interface RemoteControlGrantedMessage {
  type: "remoteControl.granted";
}

export interface RemoteControlGrabbedMessage {
  type: "remoteControl.grabbed";
}

export interface RemoteControlRevokedMessage {
  type: "remoteControl.revoked";
}

export interface RemoteControlPausedMessage {
  type: "remoteControl.paused";
}

export interface QualityChangeMessage {
  type: "quality.change";
  preset: string;
  resolution?: string;
  fps?: number;
  bitrateMbps?: number;
}

export interface PingMessage {
  type: "ping";
  timestamp: number;
}

export interface PongMessage {
  type: "pong";
  timestamp: number;
}

export interface StatsReportMessage {
  type: "statsReport";
  rtt?: number;
  fps?: number;
  bitrateMbps?: number;
  packetLoss?: number;
}

export interface InputLatencyMessage {
  type: "input.latency";
  clientTimestamp: number;
  hostReceivedTimestamp: number;
}

export interface SessionEndedMessage {
  type: "session.ended";
}

export type ControlMessage =
  | RemoteControlRequestMessage
  | RemoteControlGrantedMessage
  | RemoteControlGrabbedMessage
  | RemoteControlRevokedMessage
  | RemoteControlPausedMessage
  | QualityChangeMessage
  | PingMessage
  | PongMessage
  | StatsReportMessage
  | InputLatencyMessage
  | SessionEndedMessage;
