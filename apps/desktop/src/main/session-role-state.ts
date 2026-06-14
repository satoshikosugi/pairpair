export type MainSessionRole = "host" | "guest" | null;

let currentSessionRole: MainSessionRole = null;

export function getCurrentSessionRole(): MainSessionRole {
  return currentSessionRole;
}

export function setCurrentSessionRole(role: MainSessionRole): void {
  currentSessionRole = role;
}
