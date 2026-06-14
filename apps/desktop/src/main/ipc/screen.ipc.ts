import { ipcMain, desktopCapturer, screen, type Rectangle } from "electron";
import type { HostCursorIndicator } from "@pairpair/shared";
import log from "electron-log";
import { setCaptureArea, setTargetWindowId } from "../native/input-controller";
import { setHostOverlayBounds } from "../overlay/host-overlay";
import { getCurrentCursorKind } from "../native/input-controller";
import { getWindowBounds } from "../native/input-controller";

let _selectedSourceId: string | null = null;
let _selectedDisplayBounds: Rectangle | null = null;

function getSelectedSourceBounds(): Rectangle | null {
  if (_selectedSourceId?.startsWith("window:")) {
    const windowId = _selectedSourceId.split(":")[1] ?? "";
    const bounds = getWindowBounds(windowId);
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      return bounds;
    }
  }
  return _selectedDisplayBounds;
}

export function getSelectedSourceId(): string | null {
  return _selectedSourceId;
}

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

  ipcMain.handle("screen:setSelectedSource", async (_event, sourceId: string) => {
    _selectedSourceId = sourceId;
    setTargetWindowId(sourceId.startsWith("window:") ? sourceId.split(":")[1] ?? null : null);
    try {
      const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
      const source = sources.find((s) => s.id === sourceId);
      const displays = screen.getAllDisplays();
      const display = source?.display_id
        ? (displays.find((d) => String(d.id) === source.display_id) ?? displays[0])
        : displays[0];
      _selectedDisplayBounds = display.bounds;
      setCaptureArea({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        scaleFactor: display.scaleFactor,
      });
      setHostOverlayBounds(display.bounds);
      log.info({ sourceId, display: display.id, bounds: display.bounds }, "Selected source and capture area set");
    } catch (err) {
      log.error("screen:setSelectedSource error:", err);
    }
    return true;
  });

  ipcMain.handle("screen:getSharedCursor", (): HostCursorIndicator => {
    const bounds = getSelectedSourceBounds();
    const timestamp = Date.now();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return { x: 0, y: 0, visible: false, timestamp, kind: "default" };
    }

    const point = screen.getCursorScreenPoint();
    const withinBounds =
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height;

    if (!withinBounds) {
      return { x: 0, y: 0, visible: false, timestamp, kind: "default" };
    }

    return {
      x: (point.x - bounds.x) / bounds.width,
      y: (point.y - bounds.y) / bounds.height,
      visible: true,
      timestamp,
      kind: getCurrentCursorKind() as HostCursorIndicator["kind"],
    };
  });
}
