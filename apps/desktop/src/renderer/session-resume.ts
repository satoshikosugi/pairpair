import { normalizeNickname } from "./display-name";

export type RecentSessionRole = "host" | "guest";

export interface RecentSessionSnapshot {
  version: 1;
  role: RecentSessionRole;
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
  return now - snapshot.savedAt < ACTIVE_SESSION_TTL_MS;
}

export function getRecentSessionActionLabel(snapshot: RecentSessionSnapshot): string {
  return snapshot.role === "host" ? "ホストをやり直す" : "前回設定を確認";
}

export function getRecentSessionSummary(snapshot: RecentSessionSnapshot): string {
  if (snapshot.role === "host") {
    if (snapshot.sourceName) {
      return `前回の共有先: ${snapshot.sourceName}`;
    }
    return `${normalizeNickname(snapshot.guestDeviceName)} と使った設定`;
  }
  return `${normalizeNickname(snapshot.hostDeviceName)} への参加設定`;
}
