import { ipcMain } from "electron";
import type { HostOverlayState } from "@pairpair/shared";
import { hideHostOverlay, showHostOverlay, updateHostOverlay } from "../overlay/host-overlay";

export function setupOverlayIpc(): void {
  ipcMain.handle("overlay:show", async () => {
    await showHostOverlay();
  });

  ipcMain.handle("overlay:hide", () => {
    hideHostOverlay();
  });

  ipcMain.handle("overlay:update", async (_event, state: HostOverlayState) => {
    await updateHostOverlay(state);
  });
}
