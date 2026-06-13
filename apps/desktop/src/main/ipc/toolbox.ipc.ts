import { ipcMain } from "electron";
import type { GuestToolboxAction, GuestToolboxState } from "../../common/guest-toolbox";
import {
  closeGuestToolboxWindow,
  relayGuestToolboxAction,
  showGuestToolboxWindow,
  updateGuestToolboxState,
} from "../toolbox/guest-toolbox-window";

export function setupToolboxIpc(): void {
  ipcMain.handle("toolbox:guest:open", async () => {
    await showGuestToolboxWindow();
    return true;
  });

  ipcMain.handle("toolbox:guest:close", () => {
    closeGuestToolboxWindow();
    return true;
  });

  ipcMain.handle("toolbox:guest:updateState", (_event, state: GuestToolboxState) => {
    updateGuestToolboxState(state);
    return true;
  });

  ipcMain.handle("toolbox:guest:action", (_event, action: GuestToolboxAction) => {
    relayGuestToolboxAction(action);
    return true;
  });
}
