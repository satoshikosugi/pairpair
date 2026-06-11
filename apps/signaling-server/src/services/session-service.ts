import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { sessionStore, type SessionData } from "../infra/redis";
import { logger } from "../infra/logger";

function generateToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function createHostSession(
  deviceName: string,
  platform: string,
  appVersion: string
): Promise<{ sessionId: string; code: string; hostToken: string; expiresAt: string }> {
  const sessionId = uuidv4();
  const hostToken = generateToken();
  const code = generateUniqueCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

  const sessionData: SessionData = {
    sessionId,
    code,
    hostToken,
    hostDeviceName: deviceName,
    hostPlatform: platform,
    appVersion,
    createdAt: now,
    expiresAt,
    guestJoined: false,
    codeUsed: false,
  };

  sessionStore.set(sessionId, sessionData);
  logger.info({ sessionId, platform }, "Host session created");

  return { sessionId, code, hostToken, expiresAt: expiresAt.toISOString() };
}

export async function guestJoin(
  code: string,
  deviceName: string,
  platform: string,
  appVersion: string
): Promise<{ sessionId: string; guestToken: string; hostDeviceName: string }> {
  const sessionData = sessionStore.getByCode(code);
  if (!sessionData) {
    throw Object.assign(new Error("Session code not found or expired"), { code: "SESSION_NOT_FOUND" });
  }

  if (sessionData.codeUsed) {
    throw Object.assign(new Error("Session code already used"), { code: "SESSION_CODE_USED" });
  }
  if (sessionData.guestJoined) {
    throw Object.assign(new Error("Session already has a guest"), { code: "SESSION_FULL" });
  }

  const guestToken = generateToken();
  sessionData.guestToken = guestToken;
  sessionData.guestDeviceName = deviceName;
  sessionData.guestPlatform = platform;
  sessionData.guestJoined = true;
  sessionData.codeUsed = true;

  sessionStore.set(sessionData.sessionId, sessionData);
  logger.info({ sessionId: sessionData.sessionId, platform }, "Guest joined session");

  void appVersion;
  return { sessionId: sessionData.sessionId, guestToken, hostDeviceName: sessionData.hostDeviceName };
}

export async function getSession(sessionId: string): Promise<SessionData | null> {
  return sessionStore.get(sessionId) ?? null;
}

export async function closeSession(sessionId: string): Promise<void> {
  const session = sessionStore.get(sessionId);
  if (session) {
    sessionStore.delete(sessionId);
    logger.info({ sessionId }, "Session closed");
  }
}

function generateUniqueCode(): string {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const min = 100000;
    const max = 999999;
    const code = String(crypto.randomInt(min, max + 1));
    if (!sessionStore.getByCode(code)) {
      return code;
    }
  }
  throw new Error("Failed to generate unique session code");
}
