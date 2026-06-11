export interface BaseMessage<T extends string, P = unknown> {
  type: T;
  sessionId: string;
  payload?: P;
}

export interface HostRegisterMessage {
  type: "host.register";
  sessionId: string;
  hostToken: string;
}

export interface GuestRegisterMessage {
  type: "guest.register";
  sessionId: string;
  guestToken: string;
}

export interface GuestJoinedPayload {
  guestDeviceName: string;
  platform: "darwin" | "win32" | "linux";
}

export interface GuestJoinedMessage extends BaseMessage<"guest.joined", GuestJoinedPayload> {}

export interface RtcOfferPayload {
  sdp: string;
}

export interface RtcOfferMessage extends BaseMessage<"rtc.offer", RtcOfferPayload> {}

export interface RtcAnswerPayload {
  sdp: string;
}

export interface RtcAnswerMessage extends BaseMessage<"rtc.answer", RtcAnswerPayload> {}

export interface RtcIcePayload {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export interface RtcIceMessage extends BaseMessage<"rtc.ice", RtcIcePayload> {}

export interface SessionClosePayload {
  reason: "host_closed" | "guest_disconnected" | "timeout" | "error";
}

export interface SessionCloseMessage extends BaseMessage<"session.close", SessionClosePayload> {}

export type SignalingMessage =
  | HostRegisterMessage
  | GuestRegisterMessage
  | GuestJoinedMessage
  | RtcOfferMessage
  | RtcAnswerMessage
  | RtcIceMessage
  | SessionCloseMessage;
