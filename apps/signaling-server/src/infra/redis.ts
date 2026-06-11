/**
 * In-memory session store
 * セッションはメモリに保持され、サーバー再起動でクリアされます
 * TTL はタイマーで自動削除します
 */

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
  createdAt: Date;
  expiresAt: Date;
  guestJoined: boolean;
  codeUsed: boolean;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

class SessionStore {
  private sessions = new Map<string, SessionData>();
  private codeToSessionId = new Map<string, string>();
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  set(sessionId: string, data: SessionData): void {
    this.sessions.set(sessionId, data);
    this.codeToSessionId.set(data.code, sessionId);

    // Schedule cleanup for session
    this.scheduleCleanup(sessionId, SESSION_TTL_MS);
    // Schedule cleanup for code (shorter TTL)
    this.scheduleCodeCleanup(data.code, CODE_TTL_MS);
  }

  get(sessionId: string): SessionData | undefined {
    return this.sessions.get(sessionId);
  }

  getByCode(code: string): SessionData | undefined {
    const sessionId = this.codeToSessionId.get(code);
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
  }

  delete(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      this.codeToSessionId.delete(session.code);
    }
    this.clearCleanupTimer(sessionId);
  }

  private scheduleCleanup(sessionId: string, delayMs: number): void {
    this.clearCleanupTimer(sessionId);
    const timer = setTimeout(() => {
      this.delete(sessionId);
      this.cleanupTimers.delete(sessionId);
    }, delayMs);
    this.cleanupTimers.set(sessionId, timer);
  }

  private scheduleCodeCleanup(code: string, delayMs: number): void {
    // Code cleanup: just remove from code map, not the session
    setTimeout(() => {
      this.codeToSessionId.delete(code);
    }, delayMs);
  }

  private clearCleanupTimer(sessionId: string): void {
    const timer = this.cleanupTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(sessionId);
    }
  }

  shutdown(): void {
    this.cleanupTimers.forEach((timer) => clearTimeout(timer));
    this.cleanupTimers.clear();
    this.sessions.clear();
    this.codeToSessionId.clear();
  }
}

export const sessionStore = new SessionStore();
