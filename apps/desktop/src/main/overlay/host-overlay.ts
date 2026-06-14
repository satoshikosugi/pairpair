import { BrowserWindow, type Rectangle, screen } from "electron";
import type { HostOverlayState } from "@pairpair/shared";

let overlayWindow: BrowserWindow | null = null;
let overlayBounds: Rectangle | null = null;
const REMOTE_CURSOR_SIZE_PX = 46;
const REMOTE_CURSOR_LINE_PX = 4;

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
      .cursor, .spotlight {
        position: absolute;
        width: ${REMOTE_CURSOR_SIZE_PX}px;
        height: ${REMOTE_CURSOR_SIZE_PX}px;
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
        width: ${REMOTE_CURSOR_LINE_PX}px;
        height: 100%;
        transform: translateX(-50%);
      }
      .cursor::after {
        top: 50%;
        left: 0;
        width: 100%;
        height: ${REMOTE_CURSOR_LINE_PX}px;
        transform: translateY(-50%);
      }
      .cursor .ring {
        position: absolute;
        inset: 10px;
        border: 3px solid rgba(255, 87, 34, 0.95);
        border-radius: 999px;
        box-shadow: 0 0 22px rgba(255, 87, 34, 0.75);
      }
      .spotlight {
        width: 112px;
        height: 112px;
      }
      .spotlight .pulse {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        border: 3px solid rgba(76, 201, 240, 0.98);
        box-shadow: 0 0 24px rgba(76, 201, 240, 0.65);
        background: radial-gradient(circle, rgba(76, 201, 240, 0.24) 0%, rgba(76, 201, 240, 0.08) 35%, rgba(76, 201, 240, 0) 72%);
        animation: spotlightPulse 1.15s ease-out infinite;
      }
      .spotlight .label {
        position: absolute;
        left: 50%;
        top: calc(100% + 10px);
        transform: translateX(-50%);
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(7, 13, 24, 0.92);
        color: white;
        border: 1px solid rgba(255,255,255,0.18);
        font-family: sans-serif;
        font-size: 14px;
        white-space: nowrap;
      }
      @keyframes spotlightPulse {
        0% { transform: scale(0.72); opacity: 0.95; }
        100% { transform: scale(1.12); opacity: 0.08; }
      }
    </style>
  </head>
  <body>
    <svg id="overlay" viewBox="0 0 1 1" preserveAspectRatio="none"></svg>
    <div id="cursor" class="cursor"><div class="ring"></div></div>
    <div id="spotlight" class="spotlight"><div class="pulse"></div><div id="spotlight-label" class="label">注目</div></div>
    <script>
      const svg = document.getElementById("overlay");
      const cursor = document.getElementById("cursor");
      const spotlight = document.getElementById("spotlight");
      const spotlightLabel = document.getElementById("spotlight-label");
      window.setOverlayState = (state) => {
        if (!svg || !cursor || !spotlight || !spotlightLabel) return;
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
        const spotlightState = state.spotlight;
        if (spotlightState && spotlightState.visible) {
          spotlight.style.display = "block";
          spotlight.style.left = \`\${spotlightState.x * 100}%\`;
          spotlight.style.top = \`\${spotlightState.y * 100}%\`;
          spotlightLabel.textContent = spotlightState.label || "注目";
        } else {
          spotlight.style.display = "none";
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
    overlayWindow.close();
  }
  overlayWindow = null;
}

export async function updateHostOverlay(state: HostOverlayState): Promise<void> {
  const win = ensureOverlayWindow();
  if (!win.isVisible()) {
    await showHostOverlay();
  }
  await win.webContents.executeJavaScript(`window.setOverlayState(${JSON.stringify(state)})`, true);
}
