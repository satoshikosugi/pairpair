import type WebSocket from "ws";
import { logger } from "../infra/logger";
import { closeSession } from "../services/session-service";

interface SessionConnections {
  hostWs?: WebSocket;
  guestWs?: WebSocket;
  hostSessionId?: string;
  guestSessionId?: string;
  roleSwitchUntil?: number;
  roleSwitchTimer?: NodeJS.Timeout;
}

const registry = new Map<string, SessionConnections>();

export function getOrCreateEntry(sessionId: string): SessionConnections {
  if (!registry.has(sessionId)) {
    registry.set(sessionId, {});
  }
  return registry.get(sessionId)!;
}

export function registerHost(sessionId: string, ws: WebSocket): void {
  const entry = getOrCreateEntry(sessionId);
  entry.hostWs = ws;

  ws.on("close", () => {
    logger.info({ sessionId }, "Host WebSocket closed");
    void handleHostDisconnect(sessionId, ws);
  });

  logger.info({ sessionId }, "Host WebSocket registered");
}

export function registerGuest(sessionId: string, ws: WebSocket): void {
  const entry = getOrCreateEntry(sessionId);
  entry.guestWs = ws;

  ws.on("close", () => {
    logger.info({ sessionId }, "Guest WebSocket closed");
    void handleGuestDisconnect(sessionId, ws);
  });

  logger.info({ sessionId }, "Guest WebSocket registered");
}

export function getHostWs(sessionId: string): WebSocket | undefined {
  return registry.get(sessionId)?.hostWs;
}

export function getGuestWs(sessionId: string): WebSocket | undefined {
  return registry.get(sessionId)?.guestWs;
}

export function sendToHost(sessionId: string, message: unknown): boolean {
  const ws = getHostWs(sessionId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

export function sendToGuest(sessionId: string, message: unknown): boolean {
  const ws = getGuestWs(sessionId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

export function markRoleSwitchInProgress(sessionId: string, graceMs = 15000): void {
  const entry = getOrCreateEntry(sessionId);
  entry.roleSwitchUntil = Date.now() + graceMs;
  if (entry.roleSwitchTimer) {
    clearTimeout(entry.roleSwitchTimer);
  }
  entry.roleSwitchTimer = setTimeout(() => {
    void finalizeRoleSwitchTimeout(sessionId);
  }, graceMs);
}

function isRoleSwitchInProgress(entry: SessionConnections | undefined): boolean {
  return Boolean(entry?.roleSwitchUntil && entry.roleSwitchUntil > Date.now());
}

async function handleHostDisconnect(sessionId: string, closingWs: WebSocket): Promise<void> {
  const entry = registry.get(sessionId);
  if (!entry) return;
  if (entry.hostWs !== closingWs) return;

  if (isRoleSwitchInProgress(entry)) {
    entry.hostWs = undefined;
    await cleanupIfEmpty(sessionId);
    return;
  }

  // Notify guest if connected
  sendToGuest(sessionId, {
    type: "session.close",
    sessionId,
    payload: { reason: "host_closed" },
  });

  // Clean up
  entry.hostWs = undefined;
  await cleanupIfEmpty(sessionId);
}

async function handleGuestDisconnect(sessionId: string, closingWs: WebSocket): Promise<void> {
  const entry = registry.get(sessionId);
  if (!entry) return;
  if (entry.guestWs !== closingWs) return;

  if (isRoleSwitchInProgress(entry)) {
    entry.guestWs = undefined;
    await cleanupIfEmpty(sessionId);
    return;
  }

  // Notify host if connected
  sendToHost(sessionId, {
    type: "session.close",
    sessionId,
    payload: { reason: "guest_disconnected" },
  });

  entry.guestWs = undefined;
  await cleanupIfEmpty(sessionId);
}

async function cleanupIfEmpty(sessionId: string): Promise<void> {
  const entry = registry.get(sessionId);
  if (entry && !entry.hostWs && !entry.guestWs && isRoleSwitchInProgress(entry)) {
    return;
  }
  if (entry && !entry.hostWs && !entry.guestWs) {
    if (entry.roleSwitchTimer) {
      clearTimeout(entry.roleSwitchTimer);
    }
    registry.delete(sessionId);
    try {
      await closeSession(sessionId);
    } catch (err) {
      logger.error({ err, sessionId }, "Failed to close session on cleanup");
    }
  }
}

export function removeSession(sessionId: string): void {
  const entry = registry.get(sessionId);
  if (entry?.roleSwitchTimer) {
    clearTimeout(entry.roleSwitchTimer);
  }
  registry.delete(sessionId);
}

async function finalizeRoleSwitchTimeout(sessionId: string): Promise<void> {
  const entry = registry.get(sessionId);
  if (!entry) return;
  entry.roleSwitchUntil = undefined;
  entry.roleSwitchTimer = undefined;

  if (entry.hostWs || entry.guestWs) {
    sendToHost(sessionId, {
      type: "session.close",
      sessionId,
      payload: { reason: "error" },
    });
    sendToGuest(sessionId, {
      type: "session.close",
      sessionId,
      payload: { reason: "error" },
    });
  }

  await cleanupIfEmpty(sessionId);
}
