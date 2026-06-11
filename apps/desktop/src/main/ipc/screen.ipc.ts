import { ipcMain, desktopCapturer } from "electron";
import log from "electron-log";

export function setupScreenIpc(): void {
  ipcMain.handle("screen:getSources", async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: false,
      });
      return sources.map((source) => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
        display_id: source.display_id,
        appIcon: source.appIcon?.toDataURL() ?? null,
      }));
    } catch (err) {
      log.error("screen:getSources error:", err);
      throw err;
    }
  });
}
