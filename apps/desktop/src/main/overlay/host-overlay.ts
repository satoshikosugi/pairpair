import { BrowserWindow, type Rectangle, screen } from "electron";
import type { HostOverlayState } from "@pairpair/shared";

let overlayWindow: BrowserWindow | null = null;
let overlayBounds: Rectangle | null = null;

const OVERLAY_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
      }
      body {
        position: relative;
      }
      svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
      .cursor {
        position: absolute;
        width: 32px;
        height: 32px;
        transform: translate(-50%, -50%);
        pointer-events: none;
        display: none;
      }
      .cursor::before,
      .cursor::after {
        content: "";
        position: absolute;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.45);
        border-radius: 999px;
      }
      .cursor::before {
        left: 50%;
        top: 0;
        width: 3px;
        height: 100%;
        transform: translateX(-50%);
      }
      .cursor::after {
        top: 50%;
        left: 0;
        width: 100%;
        height: 3px;
        transform: translateY(-50%);
      }
      .cursor .ring {
        position: absolute;
        inset: 7px;
        border: 2px solid rgba(255, 87, 34, 0.95);
        border-radius: 999px;
        box-shadow: 0 0 18px rgba(255, 87, 34, 0.7);
      }
    </style>
  </head>
  <body>
    <svg id="overlay" viewBox="0 0 1 1" preserveAspectRatio="none"></svg>
    <div id="cursor" class="cursor"><div class="ring"></div></div>
    <script>
      const svg = document.getElementById("overlay");
      const cursor = document.getElementById("cursor");
      window.setOverlayState = (state) => {
        if (!svg || !cursor) return;
        svg.replaceChildren();
        for (const stroke of state.strokes || []) {
          if (!stroke.points || stroke.points.length < 2) continue;
          const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
          polyline.setAttribute("points", stroke.points.map((point) => \`\${point.x},\${point.y}\`).join(" "));
          polyline.setAttribute("fill", "none");
          polyline.setAttribute("stroke", stroke.color);
          polyline.setAttribute("stroke-width", String(Math.max(stroke.width / 500, 0.0025)));
          polyline.setAttribute("stroke-linecap", "round");
          polyline.setAttribute("stroke-linejoin", "round");
          svg.appendChild(polyline);
        }
        const guestCursor = state.guestCursor;
        if (guestCursor && guestCursor.visible) {
          cursor.style.display = "block";
          cursor.style.left = \`\${guestCursor.x * 100}%\`;
          cursor.style.top = \`\${guestCursor.y * 100}%\`;
        } else {
          cursor.style.display = "none";
        }
      };
    </script>
  </body>
</html>`;

function ensureOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  overlayWindow = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    focusable: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    fullscreenable: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      backgroundThrottling: false,
    },
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  void overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(OVERLAY_HTML)}`);
  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

export function setHostOverlayBounds(bounds: Rectangle): void {
  overlayBounds = bounds;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setBounds(bounds);
  }
}

export async function showHostOverlay(): Promise<void> {
  const win = ensureOverlayWindow();
  const bounds = overlayBounds ?? screen.getPrimaryDisplay().bounds;
  win.setBounds(bounds);
  win.showInactive();
}

export function hideHostOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
}

export async function updateHostOverlay(state: HostOverlayState): Promise<void> {
  const win = ensureOverlayWindow();
  if (!win.isVisible()) {
    await showHostOverlay();
  }
  await win.webContents.executeJavaScript(`window.setOverlayState(${JSON.stringify(state)})`, true);
}
