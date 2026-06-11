import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import type Redis from "ioredis";
import { getRedisClient } from "../infra/redis";
import { logger } from "../infra/logger";

const SESSION_KEY_PREFIX = "session:";
const CODE_SESSION_KEY_PREFIX = "code:";
const CODE_TTL_SECONDS = 600; // 10 minutes
const SESSION_TTL_SECONDS = 86400; // 24 hours

export interface SessionData {
  sessionId: string;
  code: string;
  hostToken: string;
  guestToken?: string;
  hostDeviceName: string;
  guestDeviceName?: string;
  hostPlatform: string;
  guestPlatform?: string;
  appVersion: string;
  createdAt: string;
  expiresAt: string;
  guestJoined: boolean;
  codedUsed: boolean;
}

function generateToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function createHostSession(
  deviceName: string,
  platform: string,
  appVersion: string
): Promise<{ sessionId: string; code: string; hostToken: string; expiresAt: string }> {
  const redis = getRedisClient();
  const sessionId = uuidv4();
  const hostToken = generateToken();
  const code = await generateUniqueCodeForSession(redis);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_SECONDS * 1000).toISOString();

  const sessionData: SessionData = {
    sessionId,
    code,
    hostToken,
    hostDeviceName: deviceName,
    hostPlatform: platform,
    appVersion,
    createdAt: now.toISOString(),
    expiresAt,
    guestJoined: false,
    codedUsed: false,
  };

  const sessionKey = `${SESSION_KEY_PREFIX}${sessionId}`;
  const codeKey = `${CODE_SESSION_KEY_PREFIX}${code}`;

  const pipeline = redis.pipeline();
  pipeline.set(sessionKey, JSON.stringify(sessionData), "EX", SESSION_TTL_SECONDS);
  pipeline.set(codeKey, sessionId, "EX", CODE_TTL_SECONDS);
  await pipeline.exec();

  logger.info({ sessionId, platform }, "Host session created");

  return { sessionId, code, hostToken, expiresAt };
}

export async function guestJoin(
  code: string,
  deviceName: string,
  platform: string,
  appVersion: string
): Promise<{ sessionId: string; guestToken: string; hostDeviceName: string }> {
  const redis = getRedisClient();

  const codeKey = `${CODE_SESSION_KEY_PREFIX}${code}`;
  const sessionId = await redis.get(codeKey);
  if (!sessionId) {
    throw Object.assign(new Error("Session code not found or expired"), { code: "SESSION_NOT_FOUND" });
  }

  const sessionKey = `${SESSION_KEY_PREFIX}${sessionId}`;
  const sessionJson = await redis.get(sessionKey);
  if (!sessionJson) {
    throw Object.assign(new Error("Session not found"), { code: "SESSION_NOT_FOUND" });
  }

  const sessionData: SessionData = JSON.parse(sessionJson);

  if (sessionData.codedUsed) {
    throw Object.assign(new Error("Session code already used"), { code: "SESSION_CODE_USED" });
  }
  if (sessionData.guestJoined) {
    throw Object.assign(new Error("Session already has a guest"), { code: "SESSION_FULL" });
  }

  void appVersion;

  const guestToken = generateToken();

  sessionData.guestToken = guestToken;
  sessionData.guestDeviceName = deviceName;
  sessionData.guestPlatform = platform;
  sessionData.guestJoined = true;
  sessionData.codedUsed = true;

  // Update session and invalidate code
  const pipeline = redis.pipeline();
  pipeline.set(sessionKey, JSON.stringify(sessionData), "EX", SESSION_TTL_SECONDS);
  pipeline.del(codeKey); // Invalidate code immediately
  await pipeline.exec();

  logger.info({ sessionId, platform }, "Guest joined session");

  return { sessionId, guestToken, hostDeviceName: sessionData.hostDeviceName };
}

export async function getSession(sessionId: string): Promise<SessionData | null> {
  const redis = getRedisClient();
  const sessionKey = `${SESSION_KEY_PREFIX}${sessionId}`;
  const sessionJson = await redis.get(sessionKey);
  if (!sessionJson) return null;
  return JSON.parse(sessionJson) as SessionData;
}

export async function closeSession(sessionId: string): Promise<void> {
  const redis = getRedisClient();
  const sessionKey = `${SESSION_KEY_PREFIX}${sessionId}`;
  const session = await getSession(sessionId);
  if (session) {
    const codeKey = `${CODE_SESSION_KEY_PREFIX}${session.code}`;
    const pipeline = redis.pipeline();
    pipeline.del(sessionKey);
    pipeline.del(codeKey);
    await pipeline.exec();
    logger.info({ sessionId }, "Session closed");
  }
}

async function generateUniqueCodeForSession(redis: Redis): Promise<string> {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const min = 100000;
    const max = 999999;
    const code = String(crypto.randomInt(min, max + 1));
    const codeKey = `${CODE_SESSION_KEY_PREFIX}${code}`;
    const exists = await redis.exists(codeKey);
    if (!exists) {
      return code;
    }
  }
  throw new Error("Failed to generate unique session code");
}
