import { systemPreferences } from "electron";

export interface PermissionStatus {
  screenRecording: boolean;
  accessibility: boolean;
}

export function checkPermissions(): PermissionStatus {
  if (process.platform === "darwin") {
    const screenStatus = systemPreferences.getMediaAccessStatus("screen");
    const accessibility = systemPreferences.isTrustedAccessibilityClient(false);
    return {
      screenRecording: screenStatus === "granted",
      accessibility,
    };
  }
  return { screenRecording: true, accessibility: true };
}
