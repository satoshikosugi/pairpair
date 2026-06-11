import type { SignalingMessage } from "@pairpair/shared";

type MessageHandler = (message: Record<string, unknown>) => void;

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private wsUrl = "";
  private sessionId = "";
  private token = "";
  private role: "host" | "guest" = "host";
  private messageHandlers: Map<string, MessageHandler[]> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  connect(wsUrl: string, sessionId: string, token: string, role: "host" | "guest"): void {
    this.wsUrl = wsUrl;
    this.sessionId = sessionId;
    this.token = token;
    this.role = role;
    this.intentionalClose = false;
    this.doConnect();
  }

  private doConnect(): void {
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      const registerMsg =
        this.role === "host"
          ? { type: "host.register", sessionId: this.sessionId, hostToken: this.token }
          : { type: "guest.register", sessionId: this.sessionId, guestToken: this.token };
      ws.send(JSON.stringify(registerMsg));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as Record<string, unknown>;
        const type = message.type as string;
        const handlers = this.messageHandlers.get(type) ?? [];
        const wildcardHandlers = this.messageHandlers.get("*") ?? [];
        [...handlers, ...wildcardHandlers].forEach((h) => h(message));
      } catch {
        console.warn("Failed to parse signaling message");
      }
    };

    ws.onclose = () => {
      this.ws = null;
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    ws.onerror = (event) => {
      console.error("WebSocket error:", event);
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.emit("connection.failed", { reason: "max_reconnect_attempts" });
      return;
    }
    const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, delay);
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: Partial<SignalingMessage> & Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...message, sessionId: this.sessionId }));
    }
  }

  on(type: string, handler: MessageHandler): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);
  }

  off(type: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(type) ?? [];
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
  }

  private emit(type: string, data: Record<string, unknown>): void {
    const handlers = this.messageHandlers.get(type) ?? [];
    handlers.forEach((h) => h({ type, ...data }));
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const signalingClient = new SignalingClient();
