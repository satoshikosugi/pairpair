import log from "electron-log";

export function onHostSessionStart(sourceId: string): void {
  log.info({ sourceId }, "Host session starting");
}

export function onHostSessionEnd(): void {
  log.info("Host session ended");
}
