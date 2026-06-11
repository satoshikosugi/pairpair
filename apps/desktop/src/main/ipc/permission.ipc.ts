import { ipcMain, systemPreferences } from "electron";
import log from "electron-log";

export interface PermissionStatus {
  screenRecording: boolean;
  accessibility: boolean;
}

export function setupPermissionIpc(): void {
  ipcMain.handle("permissions:check", async (): Promise<PermissionStatus> => {
    if (process.platform === "darwin") {
      try {
        const screenStatus = systemPreferences.getMediaAccessStatus("screen");
        const accessibilityStatus = systemPreferences.isTrustedAccessibilityClient(false);
        return {
          screenRecording: screenStatus === "granted",
          accessibility: accessibilityStatus,
        };
      } catch (err) {
        log.error("permissions:check error:", err);
        return { screenRecording: false, accessibility: false };
      }
    }
    // Windows/Linux: no special permissions needed for basic functionality
    return { screenRecording: true, accessibility: true };
  });

  ipcMain.handle("permissions:openSystemSettings", async (_event, settingType: string) => {
    const { shell } = await import("electron");
    if (process.platform === "darwin") {
      if (settingType === "screenRecording") {
        await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
      } else if (settingType === "accessibility") {
        await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
      }
    }
  });
}
