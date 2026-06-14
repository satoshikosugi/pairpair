import React, { useRef, useCallback, useEffect, useState } from "react";
import type {
  AnnotationPoint,
  AnnotationStroke,
  GuestCursorIndicator,
  HostCursorIndicator,
  MouseDownEvent,
  MouseMoveEvent,
  MouseUpEvent,
  MouseWheelEvent,
  SessionPermissions,
  SpotlightIndicator,
} from "@pairpair/shared";
import { toNormalizedCoordinate } from "../utils/coordinate";
import { useSessionStore } from "../store/session-store";
import { dataChannelManager } from "../webrtc/data-channel";
import { adaptiveQualityController } from "../webrtc/adaptive-quality";
import { bindRemoteVideoElement } from "../webrtc/rtc-client";

const MOUSE_MOVE_INTERVAL_MS = 16;
const REMOTE_CURSOR_SIZE_PX = 46;
const REMOTE_CURSOR_LINE_PX = 4;

interface HostCursorVisualSpec {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  node: React.ReactNode;
}

function renderCursorArrow(extra?: React.ReactNode): HostCursorVisualSpec {
  return {
    width: 56,
    height: 56,
    offsetX: 6,
    offsetY: 4,
    node: (
      <svg viewBox="0 0 56 56" width="56" height="56">
        <path d="M9 6 L9 42 L18 33 L25 49 L32 46 L25 30 L38 30 Z" fill="#ffffff" stroke="#0b1220" strokeWidth="4" strokeLinejoin="round" />
        {extra}
      </svg>
    ),
  };
}

function renderResizeCursor(kind: HostCursorIndicator["kind"]): HostCursorVisualSpec {
  const rotation = kind === "ew-resize" ? 0 : kind === "ns-resize" ? 90 : kind === "nwse-resize" ? 45 : -45;
  return {
    width: 64,
    height: 64,
    offsetX: 32,
    offsetY: 32,
    node: (
      <svg viewBox="0 0 64 64" width="64" height="64">
        <g transform={`rotate(${rotation} 32 32)`}>
          <line x1="16" y1="32" x2="48" y2="32" stroke="#0b1220" strokeWidth="10" strokeLinecap="round" />
          <line x1="16" y1="32" x2="48" y2="32" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
          <path d="M16 32 L24 24 M16 32 L24 40 M48 32 L40 24 M48 32 L40 40" stroke="#0b1220" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 32 L24 24 M16 32 L24 40 M48 32 L40 24 M48 32 L40 40" stroke="#6fd3ff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    ),
  };
}

function getHostCursorVisual(kind: HostCursorIndicator["kind"]): HostCursorVisualSpec {
  switch (kind) {
    case "text":
      return {
        width: 34,
        height: 58,
        offsetX: 17,
        offsetY: 29,
        node: (
          <svg viewBox="0 0 34 58" width="34" height="58">
            <path d="M7 7 H27 M7 51 H27 M17 7 V51" stroke="#0b1220" strokeWidth="10" strokeLinecap="round" />
            <path d="M7 7 H27 M7 51 H27 M17 7 V51" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
          </svg>
        ),
      };
    case "crosshair":
      return {
        width: 56,
        height: 56,
        offsetX: 28,
        offsetY: 28,
        node: (
          <svg viewBox="0 0 56 56" width="56" height="56">
            <circle cx="28" cy="28" r="10" fill="none" stroke="#0b1220" strokeWidth="8" />
            <circle cx="28" cy="28" r="10" fill="none" stroke="#ffffff" strokeWidth="4" />
            <path d="M28 6 V16 M28 40 V50 M6 28 H16 M40 28 H50" stroke="#0b1220" strokeWidth="8" strokeLinecap="round" />
            <path d="M28 6 V16 M28 40 V50 M6 28 H16 M40 28 H50" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
          </svg>
        ),
      };
    case "pointer":
      return {
        width: 58,
        height: 58,
        offsetX: 14,
        offsetY: 6,
        node: (
          <svg viewBox="0 0 58 58" width="58" height="58">
            <path d="M13 7 L13 34 L20 27 L23 49 H31 L30 31 H37 L37 18 L30 18 L30 10 H23 L23 22 L19 18 L19 7 Z" fill="#ffffff" stroke="#0b1220" strokeWidth="4" strokeLinejoin="round" />
          </svg>
        ),
      };
    case "move":
      return {
        width: 64,
        height: 64,
        offsetX: 32,
        offsetY: 32,
        node: (
          <svg viewBox="0 0 64 64" width="64" height="64">
            <path d="M32 8 L38 16 H34 V26 H44 V22 L52 28 L44 34 V30 H34 V40 H38 L32 48 L26 40 H30 V30 H20 V34 L12 28 L20 22 V26 H30 V16 H26 Z" fill="#6fd3ff" stroke="#0b1220" strokeWidth="4" strokeLinejoin="round" />
          </svg>
        ),
      };
    case "wait":
      return {
        width: 54,
        height: 54,
        offsetX: 27,
        offsetY: 27,
        node: (
          <svg viewBox="0 0 54 54" width="54" height="54">
            <circle cx="27" cy="27" r="18" fill="none" stroke="#0b1220" strokeWidth="8" />
            <circle cx="27" cy="27" r="18" fill="none" stroke="#ffffff" strokeWidth="4" strokeDasharray="70 38" strokeLinecap="round" />
            <path d="M27 17 V27 L34 34" stroke="#6fd3ff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      };
    case "progress":
      return renderCursorArrow(
        <>
          <circle cx="40" cy="40" r="10" fill="#0b1220" />
          <circle cx="40" cy="40" r="8" fill="none" stroke="#6fd3ff" strokeWidth="3" strokeDasharray="22 12" strokeLinecap="round" />
        </>,
      );
    case "help":
      return renderCursorArrow(
        <>
          <circle cx="40" cy="41" r="10" fill="#0b1220" />
          <text x="40" y="45" textAnchor="middle" fontSize="14" fontWeight="700" fill="#6fd3ff" fontFamily="sans-serif">?</text>
        </>,
      );
    case "not-allowed":
      return {
        width: 56,
        height: 56,
        offsetX: 28,
        offsetY: 28,
        node: (
          <svg viewBox="0 0 56 56" width="56" height="56">
            <circle cx="28" cy="28" r="18" fill="#ffffff" stroke="#0b1220" strokeWidth="4" />
            <path d="M17 39 L39 17" stroke="#ff6b6b" strokeWidth="8" strokeLinecap="round" />
          </svg>
        ),
      };
    case "ew-resize":
    case "ns-resize":
    case "nwse-resize":
    case "nesw-resize":
      return renderResizeCursor(kind);
    case "default":
    default:
      return renderCursorArrow();
  }
}

interface RemoteVideoViewProps {
  stream?: MediaStream;
  annotations: AnnotationStroke[];
  remoteCursor: GuestCursorIndicator | null;
  hostCursor: HostCursorIndicator | null;
  spotlight: SpotlightIndicator | null;
  markerEnabled: boolean;
  onMarkerStart: (point: AnnotationPoint) => void;
  onMarkerMove: (point: AnnotationPoint) => void;
  onMarkerEnd: () => void;
  onHoverPreview: (point: AnnotationPoint | null) => void;
  onSpotlight?: (point: AnnotationPoint) => void;
  fullscreen: boolean;
  displayMode: "fit" | "native";
  wheelDirection: "standard" | "natural";
  sessionPermissions: SessionPermissions;
  adaptiveMode?: boolean;
}

export function RemoteVideoView({
  stream,
  annotations,
  remoteCursor,
  hostCursor,
  spotlight,
  markerEnabled,
  onMarkerStart,
  onMarkerMove,
  onMarkerEnd,
  onHoverPreview,
  onSpotlight,
  fullscreen,
  displayMode,
  wheelDirection,
  sessionPermissions,
  adaptiveMode = false,
}: RemoteVideoViewProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastMouseMoveTime = useRef(0);
  const lastMousePos = useRef({ x: -1, y: -1 });
  const isDrawingRef = useRef(false);
  const isPanningRef = useRef(false);
  const panStartPosRef = useRef({ clientX: 0, clientY: 0, scrollLeft: 0, scrollTop: 0 });
  const { controlState } = useSessionStore();
  const canControl = controlState === "controlAllowed";
  const fitToViewport = displayMode === "fit";
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const updateVideoSize = useCallback(() => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return;
    setVideoSize({ width: video.videoWidth, height: video.videoHeight });
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    bindRemoteVideoElement(videoRef.current);
    return () => {
      bindRemoteVideoElement(null);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateViewportSize = () => {
      const styles = window.getComputedStyle(container);
      const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
      const verticalPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
      setViewportSize({
        width: Math.max(0, container.clientWidth - horizontalPadding),
        height: Math.max(0, container.clientHeight - verticalPadding),
      });
    };

    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(container);
    updateViewportSize();
    return () => observer.disconnect();
  }, [fullscreen]);

  const displaySize = (() => {
    if (!videoSize.width || !videoSize.height) return null;
    if (!fitToViewport || !viewportSize.width || !viewportSize.height) return videoSize;
    const scale = Math.min(viewportSize.width / videoSize.width, viewportSize.height / videoSize.height);
    return {
      width: Math.max(1, Math.round(videoSize.width * scale)),
      height: Math.max(1, Math.round(videoSize.height * scale)),
    };
  })();
  const shouldCenterNative =
    !fitToViewport &&
    !!displaySize &&
    displaySize.width <= viewportSize.width &&
    displaySize.height <= viewportSize.height;

  const getPoint = useCallback((clientX: number, clientY: number): AnnotationPoint | null => {
    if (!videoRef.current) return null;
    return toNormalizedCoordinate(videoRef.current, clientX, clientY);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
      // Pan mode (right-click drag)
      if (isPanningRef.current) {
        const container = containerRef.current;
        if (container) {
          const deltaX = e.clientX - panStartPosRef.current.clientX;
          const deltaY = e.clientY - panStartPosRef.current.clientY;
          
          // Calculate bounds
          const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
          const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
          
          // Clamp scroll position within valid bounds
          container.scrollLeft = Math.max(0, Math.min(maxScrollLeft, panStartPosRef.current.scrollLeft - deltaX));
          container.scrollTop = Math.max(0, Math.min(maxScrollTop, panStartPosRef.current.scrollTop - deltaY));
        }
        return;
      }

      const point = getPoint(e.clientX, e.clientY);
      if (!point) return;

      if (markerEnabled && isDrawingRef.current) {
        onMarkerMove(point);
        return;
      }

      if (!canControl || !sessionPermissions.mouseMove) {
        const now = Date.now();
        if (now - lastMouseMoveTime.current < MOUSE_MOVE_INTERVAL_MS) return;
        lastMouseMoveTime.current = now;
        onHoverPreview(point);
        return;
      }

      const now = Date.now();
      if (now - lastMouseMoveTime.current < MOUSE_MOVE_INTERVAL_MS) return;

      if (
        Math.abs(point.x - lastMousePos.current.x) < 0.001 &&
        Math.abs(point.y - lastMousePos.current.y) < 0.001
      ) {
        return;
      }

      lastMouseMoveTime.current = now;
      lastMousePos.current = point;

      const event: MouseMoveEvent = {
        type: "mouse.move",
        x: point.x,
        y: point.y,
        screenId: "primary",
        timestamp: now,
      };
      if (adaptiveMode) {
        adaptiveQualityController.onInputEvent(event);
      }
      dataChannelManager.sendInput(event);
    },
    [canControl, getPoint, markerEnabled, onHoverPreview, onMarkerMove, sessionPermissions.mouseMove, adaptiveMode]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
      const point = getPoint(e.clientX, e.clientY);
      if (!point) return;

      if (e.button === 2 && e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        onSpotlight?.(point);
        return;
      }

      // Right-click pan mode (for native/scaled views with overflow)
      if (e.button === 2 && !fitToViewport) {
        const container = containerRef.current;
        if (container && (container.scrollWidth > container.clientWidth || container.scrollHeight > container.clientHeight)) {
          isPanningRef.current = true;
          panStartPosRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            scrollLeft: container.scrollLeft,
            scrollTop: container.scrollTop,
          };
          e.preventDefault();
          return;
        }
      }

      if (markerEnabled) {
        isDrawingRef.current = true;
        onMarkerStart(point);
        return;
      }

      if (!canControl || !sessionPermissions.mouseClick) {
        return;
      }

      const button = e.button === 0 ? "left" : e.button === 2 ? "right" : "middle";
      const event: MouseDownEvent = { type: "mouse.down", button, x: point.x, y: point.y };
      if (adaptiveMode) {
        adaptiveQualityController.onInputEvent(event);
      }
      dataChannelManager.sendInput(event);
    },
    [canControl, fitToViewport, getPoint, markerEnabled, onMarkerStart, onSpotlight, sessionPermissions.mouseClick, adaptiveMode]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
      if (markerEnabled || canControl) return;
      if (e.button !== 0) return;
      if (
        !sessionPermissions.mouseMove &&
        !sessionPermissions.mouseClick &&
        !sessionPermissions.mouseWheel &&
        !sessionPermissions.keyboard
      ) {
        return;
      }

      const point = getPoint(e.clientX, e.clientY);
      if (!point) return;

      useSessionStore.getState().setControlState("controlAllowed");
      dataChannelManager.sendControl({ type: "remoteControl.grabbed" });
      onHoverPreview(null);
    },
    [canControl, getPoint, markerEnabled, onHoverPreview, sessionPermissions.keyboard, sessionPermissions.mouseClick, sessionPermissions.mouseMove, sessionPermissions.mouseWheel],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
      // End pan mode
      if (isPanningRef.current) {
        isPanningRef.current = false;
        e.preventDefault();
        return;
      }

      const point = getPoint(e.clientX, e.clientY);
      if (!point) return;

      if (markerEnabled && isDrawingRef.current) {
        isDrawingRef.current = false;
        onMarkerEnd();
        return;
      }

      if (!canControl || !sessionPermissions.mouseClick) return;

      const button = e.button === 0 ? "left" : e.button === 2 ? "right" : "middle";
      const event: MouseUpEvent = { type: "mouse.up", button, x: point.x, y: point.y };
      if (adaptiveMode) {
        adaptiveQualityController.onInputEvent(event);
      }
      dataChannelManager.sendInput(event);
    },
    [canControl, getPoint, markerEnabled, onMarkerEnd, sessionPermissions.mouseClick, adaptiveMode]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLVideoElement>) => {
      if (!canControl || markerEnabled || !sessionPermissions.mouseWheel) return;
      const point = getPoint(e.clientX, e.clientY);
      if (!point) return;

      e.preventDefault();
      const event: MouseWheelEvent = {
        type: "mouse.wheel",
        deltaX: Math.round(e.deltaX * (wheelDirection === "standard" ? -1 : 1)),
        deltaY: Math.round(e.deltaY * (wheelDirection === "standard" ? -1 : 1)),
        x: point.x,
        y: point.y,
      };
      if (adaptiveMode) {
        adaptiveQualityController.onInputEvent(event);
      }
      dataChannelManager.sendInput(event);
    },
    [canControl, getPoint, markerEnabled, sessionPermissions.mouseWheel, wheelDirection, adaptiveMode]
  );

  const handleMouseLeave = useCallback(() => {
    isDrawingRef.current = false;
    isPanningRef.current = false;
    onMarkerEnd();
    onHoverPreview(null);
  }, [onHoverPreview, onMarkerEnd]);

  useEffect(() => {
    if (!spotlight?.visible || fitToViewport) return;
    const container = containerRef.current;
    const renderedWidth = displaySize?.width ?? videoSize.width;
    const renderedHeight = displaySize?.height ?? videoSize.height;
    if (!container || !renderedWidth || !renderedHeight) return;

    const targetLeft = Math.max(0, renderedWidth * spotlight.x - container.clientWidth / 2);
    const targetTop = Math.max(0, renderedHeight * spotlight.y - container.clientHeight / 2);
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);

    container.scrollTo({
      left: Math.min(targetLeft, maxScrollLeft),
      top: Math.min(targetTop, maxScrollTop),
      behavior: "smooth",
    });
  }, [displaySize?.height, displaySize?.width, fitToViewport, spotlight, videoSize.height, videoSize.width]);

  const hostCursorVisual = hostCursor ? getHostCursorVisual(hostCursor.kind) : null;

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        display: fitToViewport || shouldCenterNative ? "flex" : "block",
        alignItems: fitToViewport || shouldCenterNative ? "center" : undefined,
        justifyContent: fitToViewport || shouldCenterNative ? "center" : undefined,
        background: "#000",
        padding: fullscreen ? 0 : 12,
        minWidth: 0,
        minHeight: 0,
        overflow: fitToViewport ? "hidden" : "auto",
      }}
    >
      <div
        style={{
          position: "relative",
          display: fitToViewport || shouldCenterNative ? "inline-flex" : "block",
          flex: fitToViewport || shouldCenterNative ? "0 0 auto" : undefined,
          margin: fitToViewport || shouldCenterNative ? "auto" : undefined,
          width: displaySize?.width,
          height: displaySize?.height,
        }}
      >
        <video
          ref={videoRef}
          id="remote-video"
          data-remote="true"
          autoPlay
          muted
          playsInline
          onLoadedMetadata={updateVideoSize}
          onResize={updateVideoSize}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          onWheel={handleWheel}
          onMouseLeave={handleMouseLeave}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            display: "block",
            width: displaySize?.width ?? "auto",
            height: displaySize?.height ?? "auto",
            // During remote control, rely on the host cursor rendered in the shared video
            // so resize/text/drag affordances match the actual target application.
            cursor: markerEnabled ? "cell" : canControl ? "none" : !fitToViewport ? "grab" : "default",
            userSelect: "none",
          }}
        />
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          {annotations.map((stroke) =>
            stroke.points.length >= 2 ? (
              <polyline
                key={stroke.id}
                points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="none"
                stroke={stroke.color}
                strokeWidth={Math.max(stroke.width / 500, 0.0025)}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null,
          )}
        </svg>
        {remoteCursor?.visible && (
          <div
            style={{
              position: "absolute",
              left: `${remoteCursor.x * 100}%`,
              top: `${remoteCursor.y * 100}%`,
              width: REMOTE_CURSOR_SIZE_PX,
              height: REMOTE_CURSOR_SIZE_PX,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: 0,
                width: REMOTE_CURSOR_LINE_PX,
                height: "100%",
                transform: "translateX(-50%)",
                background: "#fff",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.7)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: 0,
                width: "100%",
                height: REMOTE_CURSOR_LINE_PX,
                transform: "translateY(-50%)",
                background: "#fff",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.7)",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 10,
                borderRadius: "50%",
                border: "3px solid rgba(255, 87, 34, 0.95)",
                boxShadow: "0 0 22px rgba(255, 87, 34, 0.75)",
              }}
            />
          </div>
        )}
        {hostCursor?.visible && (
          <div
            style={{
              position: "absolute",
              left: `${hostCursor.x * 100}%`,
              top: `${hostCursor.y * 100}%`,
              width: hostCursorVisual?.width,
              height: hostCursorVisual?.height,
              transform: `translate(-${hostCursorVisual?.offsetX ?? 0}px, -${hostCursorVisual?.offsetY ?? 0}px)`,
              pointerEvents: "none",
              filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.26))",
            }}
          >
            {hostCursorVisual?.node}
          </div>
        )}
        {spotlight?.visible && (
          <div
            style={{
              position: "absolute",
              left: `${spotlight.x * 100}%`,
              top: `${spotlight.y * 100}%`,
              width: 112,
              height: 112,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                border: "3px solid rgba(76, 201, 240, 0.98)",
                boxShadow: "0 0 24px rgba(76, 201, 240, 0.65)",
                background: "radial-gradient(circle, rgba(76, 201, 240, 0.24) 0%, rgba(76, 201, 240, 0.08) 35%, rgba(76, 201, 240, 0) 72%)",
                animation: "pairpairSpotlightPulse 1.15s ease-out infinite",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 10px)",
                left: "50%",
                transform: "translateX(-50%)",
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(7, 13, 24, 0.92)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.18)",
                fontSize: 14,
                fontWeight: 700,
                whiteSpace: "nowrap",
                boxShadow: "0 10px 26px rgba(0,0,0,0.34)",
              }}
            >
              {spotlight.label ?? "注目"}
            </div>
            <style>{`
              @keyframes pairpairSpotlightPulse {
                0% { transform: scale(0.72); opacity: 0.95; }
                100% { transform: scale(1.12); opacity: 0.08; }
              }
            `}</style>
          </div>
        )}
      </div>
    </div>
  );
}
