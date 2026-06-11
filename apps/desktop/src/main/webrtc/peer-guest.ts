import log from "electron-log";

export function onGuestSessionStart(sessionId: string): void {
  log.info({ sessionId }, "Guest session starting");
}

export function onGuestSessionEnd(): void {
  log.info("Guest session ended");
}
