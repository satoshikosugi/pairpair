import type { AnnotationPoint, AnnotationStroke, GuestCursorIndicator, SpotlightIndicator } from "./annotation";
import type { PermissionPresetId, SessionPermissions } from "./permissions";

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

export interface AuthHelloMessage {
  type: "auth.hello";
  code: string;
}

export interface AuthRequiredMessage {
  type: "auth.required";
}

export interface AuthKe1Message {
  type: "auth.ke1";
  payload: number[];
}

export interface AuthKe2Message {
  type: "auth.ke2";
  payload: number[];
}

export interface AuthKe3Message {
  type: "auth.ke3";
  payload: number[];
}

export interface AuthResultMessage {
  type: "auth.result";
  success: boolean;
  reason?: "invalid_code" | "invalid_passphrase" | "protocol_error";
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

export interface SpotlightShowMessage {
  type: "spotlight.show";
  spotlight: SpotlightIndicator;
}

export interface ClipboardSnippetMessage {
  type: "clipboard.snippet";
  text: string;
  senderRole: "host" | "guest";
  timestamp: number;
}

export interface SessionRoleSwitchRequestMessage {
  type: "session.roleSwitch.request";
  guestToken: string;
}

export interface SessionRoleSwitchReadyMessage {
  type: "session.roleSwitch.ready";
  hostToken: string;
}

export interface SessionRoleSwitchReadyAckMessage {
  type: "session.roleSwitch.readyAck";
}

export interface PermissionProfileUpdatedMessage {
  type: "permission.profile.updated";
  presetId: PermissionPresetId;
  permissions: SessionPermissions;
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
  | AuthHelloMessage
  | AuthRequiredMessage
  | AuthKe1Message
  | AuthKe2Message
  | AuthKe3Message
  | AuthResultMessage
  | AnnotationStrokeBeginMessage
  | AnnotationStrokeAppendMessage
  | AnnotationStrokeEndMessage
  | AnnotationUndoMessage
  | AnnotationClearMessage
  | GuestCursorMessage
  | SpotlightShowMessage
  | ClipboardSnippetMessage
  | PermissionProfileUpdatedMessage
  | SessionRoleSwitchRequestMessage
  | SessionRoleSwitchReadyMessage
  | SessionRoleSwitchReadyAckMessage;
