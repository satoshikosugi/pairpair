import React, { useRef, useCallback, useEffect, useState } from "react";
import type {
  AnnotationPoint,
  AnnotationStroke,
  GuestCursorIndicator,
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

interface RemoteVideoViewProps {
  stream?: MediaStream;
  annotations: AnnotationStroke[];
  remoteCursor: GuestCursorIndicator | null;
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
              width: 30,
              height: 30,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: 0,
                width: 3,
                height: "100%",
                transform: "translateX(-50%)",
                background: "#fff",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.65)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: 0,
                width: "100%",
                height: 3,
                transform: "translateY(-50%)",
                background: "#fff",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.65)",
              }}
            />
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
