export type RecentSessionRole = "host" | "guest";
export type RecentSessionStage = "waiting" | "active";

export interface RecentSessionSnapshot {
  version: 1;
  role: RecentSessionRole;
  stage: RecentSessionStage;
  sessionId: string;
  code: string;
  wsUrl: string;
  token: string;
  expiresAt: string | null;
  hostDeviceName: string | null;
  guestDeviceName: string | null;
  sourceName: string | null;
  sourceDisplayId: string | null;
  requiresPassphrase: boolean;
  savedAt: number;
}

const ACTIVE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function isRecentSessionResumable(snapshot: RecentSessionSnapshot | null | undefined, now = Date.now()): snapshot is RecentSessionSnapshot {
  if (!snapshot) return false;
  if (snapshot.version !== 1) return false;
  if (!snapshot.sessionId || !snapshot.code || !snapshot.wsUrl || !snapshot.token) return false;

  if (snapshot.stage === "waiting" && snapshot.expiresAt) {
    return new Date(snapshot.expiresAt).getTime() > now;
  }

  return now - snapshot.savedAt < ACTIVE_SESSION_TTL_MS;
}

export function getRecentSessionActionLabel(snapshot: RecentSessionSnapshot): string {
  if (snapshot.role === "host") {
    return snapshot.stage === "waiting" ? "待機セッションを再開" : "ホストとして再参加";
  }
  return "ゲストとして再参加";
}

export function getRecentSessionSummary(snapshot: RecentSessionSnapshot): string {
  if (snapshot.role === "host") {
    return snapshot.stage === "waiting"
      ? "ゲスト接続待ち"
      : `${snapshot.guestDeviceName ?? "Guest"} とのセッション`;
  }
  return `${snapshot.hostDeviceName ?? "Host"} へ再参加`;
}
