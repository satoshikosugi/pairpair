import { setupScreenIpc } from "./screen.ipc";
import { setupPermissionIpc } from "./permission.ipc";
import { setupSettingsIpc } from "./settings.ipc";
import { setupInputIpc } from "./input.ipc";
import { setupSessionIpc } from "./session.ipc";

export function setupIpcHandlers(): void {
  setupScreenIpc();
  setupPermissionIpc();
  setupSettingsIpc();
  setupInputIpc();
  setupSessionIpc();
}
