import type { AnnotationPoint, AnnotationStroke, GuestCursorIndicator } from "./annotation";

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

export interface AnnotationStrokeBeginMessage {
  type: "annotation.stroke.begin";
  stroke: Omit<AnnotationStroke, "points">;
  point: AnnotationPoint;
}

export interface AnnotationStrokeAppendMessage {
  type: "annotation.stroke.append";
  strokeId: string;
  point: AnnotationPoint;
}

export interface AnnotationStrokeEndMessage {
  type: "annotation.stroke.end";
  strokeId: string;
}

export interface AnnotationUndoMessage {
  type: "annotation.undo";
}

export interface AnnotationClearMessage {
  type: "annotation.clear";
}

export interface GuestCursorMessage {
  type: "guest.cursor";
  cursor: GuestCursorIndicator;
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
  | SessionEndedMessage
  | AnnotationStrokeBeginMessage
  | AnnotationStrokeAppendMessage
  | AnnotationStrokeEndMessage
  | AnnotationUndoMessage
  | AnnotationClearMessage
  | GuestCursorMessage;
