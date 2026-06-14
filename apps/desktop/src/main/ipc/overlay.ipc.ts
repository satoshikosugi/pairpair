import { ipcMain } from "electron";
import type { HostOverlayState } from "@pairpair/shared";
import { hideHostOverlay, showHostOverlay, updateHostOverlay } from "../overlay/host-overlay";
import { getCurrentSessionRole } from "../session-role-state";

export function setupOverlayIpc(): void {
  ipcMain.handle("overlay:show", async () => {
    if (getCurrentSessionRole() !== "host") return;
    await showHostOverlay();
  });

  ipcMain.handle("overlay:hide", () => {
    hideHostOverlay();
  });

  ipcMain.handle("overlay:update", async (_event, state: HostOverlayState) => {
    if (getCurrentSessionRole() !== "host") return;
    await updateHostOverlay(state);
  });
}
