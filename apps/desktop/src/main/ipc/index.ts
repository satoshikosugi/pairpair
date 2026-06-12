import { setupScreenIpc } from "./screen.ipc";
import { setupPermissionIpc } from "./permission.ipc";
import { setupSettingsIpc } from "./settings.ipc";
import { setupInputIpc } from "./input.ipc";
import { setupSessionIpc } from "./session.ipc";
import { setupMediaIpc } from "./media.ipc";
import { setupActivityMonitorIpc } from "./activity-monitor.ipc";
import { setupOverlayIpc } from "./overlay.ipc";

export function setupIpcHandlers(): void {
  setupScreenIpc();
  setupPermissionIpc();
  setupSettingsIpc();
  setupInputIpc();
  setupSessionIpc();
  setupMediaIpc();
  setupActivityMonitorIpc();
  setupOverlayIpc();
}
