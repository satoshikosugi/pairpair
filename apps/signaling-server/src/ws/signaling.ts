import type WebSocket from "ws";
import { logger } from "../infra/logger";
import {
  getGuestWs,
  registerHost,
  registerGuest,
  sendToHost,
  sendToGuest,
  removeSession,
  markRoleSwitchInProgress,
} from "./session-registry";
import { getSession, closeSession } from "../services/session-service";

interface IncomingMessage {
  type: string;
  sessionId?: string;
  hostToken?: string;
  guestToken?: string;
  payload?: unknown;
}

const HEARTBEAT_INTERVAL_MS = 30000;
const HEARTBEAT_TIMEOUT_MS = 10000;

export function handleSignalingConnection(ws: WebSocket): void {
  let isAlive = true;
  let sessionId: string | undefined;
  let role: "host" | "guest" | undefined;

  // Setup heartbeat
  const heartbeatInterval = setInterval(() => {
    if (!isAlive) {
      logger.warn({ sessionId, role }, "WebSocket heartbeat timeout - terminating");
      ws.terminate();
      return;
    }
    isAlive = false;
    ws.ping();
  }, HEARTBEAT_INTERVAL_MS);

  ws.on("pong", () => {
    isAlive = true;
  });

  ws.on("message", async (data) => {
    let message: IncomingMessage;
    try {
      message = JSON.parse(data.toString()) as IncomingMessage;
    } catch {
      logger.warn("Invalid JSON message received");
      return;
    }

    try {
      await handleMessage(ws, message, { sessionId, role }, (sid, r) => {
        sessionId = sid;
        role = r;
      });
    } catch (err) {
      logger.error({ err, type: message.type }, "Error handling WebSocket message");
    }
  });

  ws.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  ws.on("error", (err) => {
    logger.error({ err, sessionId, role }, "WebSocket error");
    clearInterval(heartbeatInterval);
  });

  void HEARTBEAT_TIMEOUT_MS;
}

async function handleMessage(
  ws: WebSocket,
  message: IncomingMessage,
  ctx: { sessionId?: string; role?: "host" | "guest" },
  setCtx: (sessionId: string, role: "host" | "guest") => void
): Promise<void> {
  const { type } = message;

  if (type === "host.register") {
    await handleHostRegister(ws, message, setCtx);
    return;
  }

  if (type === "guest.register") {
    await handleGuestRegister(ws, message, setCtx);
    return;
  }

  // All subsequent messages require a registered session
  if (!ctx.sessionId || !ctx.role) {
    logger.warn({ type }, "Received message before registration");
    return;
  }

  const sessionId = ctx.sessionId;

  if (message.sessionId && message.sessionId !== sessionId) {
    logger.warn({ declaredSessionId: message.sessionId, sessionId, type }, "Mismatched sessionId");
    return;
  }

  switch (type) {
    case "rtc.offer":
      // Host -> Guest
      if (ctx.role !== "host") return;
      sendToGuest(sessionId, { type: "rtc.offer", sessionId, payload: message.payload as { sdp: string } });
      break;

    case "rtc.answer":
      // Guest -> Host
      if (ctx.role !== "guest") return;
      sendToHost(sessionId, { type: "rtc.answer", sessionId, payload: message.payload as { sdp: string } });
      break;

    case "rtc.ice":
      // Bidirectional
      if (ctx.role === "host") {
        sendToGuest(sessionId, { type: "rtc.ice", sessionId, payload: message.payload });
      } else {
        sendToHost(sessionId, { type: "rtc.ice", sessionId, payload: message.payload });
      }
      break;

    case "session.close":
      await handleSessionClose(sessionId, ctx.role);
      break;

    case "session.roleSwitch.prepare":
      markRoleSwitchInProgress(sessionId);
      ws.send(JSON.stringify({ type: "session.roleSwitch.prepared", sessionId }));
      break;

    default:
      logger.warn({ type }, "Unknown message type");
  }
}

async function handleHostRegister(
  ws: WebSocket,
  message: IncomingMessage,
  setCtx: (sessionId: string, role: "host" | "guest") => void
): Promise<void> {
  const { sessionId, hostToken } = message;
  if (!sessionId || !hostToken) {
    logger.warn("host.register missing sessionId or hostToken");
    return;
  }

  const session = await getSession(sessionId);
  if (!session) {
    ws.send(JSON.stringify({ type: "error", code: "SESSION_NOT_FOUND" }));
    return;
  }

  if (session.hostToken !== hostToken) {
    logger.warn({ sessionId }, "host.register invalid token");
    ws.send(JSON.stringify({ type: "error", code: "INVALID_TOKEN" }));
    return;
  }

  registerHost(sessionId, ws);
  setCtx(sessionId, "host");
  ws.send(JSON.stringify({ type: "host.registered", sessionId }));

  const guestWs = getGuestWs(sessionId);
  if (guestWs && guestWs.readyState === guestWs.OPEN) {
    sendToHost(sessionId, {
      type: "guest.joined",
      sessionId,
      payload: {
        guestDeviceName: session.guestDeviceName ?? "Unknown",
        platform: session.guestPlatform ?? "win32",
      },
    });
  }

  logger.info({ sessionId }, "Host registered on WebSocket");
}

async function handleGuestRegister(
  ws: WebSocket,
  message: IncomingMessage,
  setCtx: (sessionId: string, role: "host" | "guest") => void
): Promise<void> {
  const { sessionId, guestToken } = message;
  if (!sessionId || !guestToken) {
    logger.warn("guest.register missing sessionId or guestToken");
    return;
  }

  const session = await getSession(sessionId);
  if (!session) {
    ws.send(JSON.stringify({ type: "error", code: "SESSION_NOT_FOUND" }));
    return;
  }

  if (session.guestToken !== guestToken) {
    logger.warn({ sessionId }, "guest.register invalid token");
    ws.send(JSON.stringify({ type: "error", code: "INVALID_TOKEN" }));
    return;
  }

  registerGuest(sessionId, ws);
  setCtx(sessionId, "guest");
  ws.send(JSON.stringify({ type: "guest.registered", sessionId }));

  // Notify host that guest has joined
  const sent = sendToHost(sessionId, {
    type: "guest.joined",
    sessionId,
    payload: {
      guestDeviceName: session.guestDeviceName ?? "Unknown",
      platform: session.guestPlatform ?? "win32",
    },
  });

  logger.info({ sessionId, hostNotified: sent }, "Guest registered on WebSocket");
}

async function handleSessionClose(sessionId: string, role: "host" | "guest"): Promise<void> {
  const reason = role === "host" ? "host_closed" : "guest_disconnected";

  // Notify the other party
  if (role === "host") {
    sendToGuest(sessionId, { type: "session.close", sessionId, payload: { reason } });
  } else {
    sendToHost(sessionId, { type: "session.close", sessionId, payload: { reason } });
  }

  removeSession(sessionId);
  await closeSession(sessionId);
  logger.info({ sessionId, role }, "Session closed");
}
