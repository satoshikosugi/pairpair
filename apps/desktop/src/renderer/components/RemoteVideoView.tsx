import React, { useRef, useCallback, useEffect, useState } from "react";
import type { AnnotationPoint, AnnotationStroke, GuestCursorIndicator, MouseDownEvent, MouseMoveEvent, MouseUpEvent, MouseWheelEvent } from "@pairpair/shared";
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
  markerEnabled: boolean;
  onMarkerStart: (point: AnnotationPoint) => void;
  onMarkerMove: (point: AnnotationPoint) => void;
  onMarkerEnd: () => void;
  onHoverPreview: (point: AnnotationPoint | null) => void;
  fullscreen: boolean;
  displayMode: "fit" | "native";
  wheelDirection: "standard" | "natural";
  adaptiveMode?: boolean;
}

export function RemoteVideoView({
  stream,
  annotations,
  remoteCursor,
  markerEnabled,
  onMarkerStart,
  onMarkerMove,
  onMarkerEnd,
  onHoverPreview,
  fullscreen,
  displayMode,
  wheelDirection,
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

      if (!canControl) {
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
    [canControl, getPoint, markerEnabled, onHoverPreview, onMarkerMove, adaptiveMode]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
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

      const point = getPoint(e.clientX, e.clientY);
      if (!point) return;

      if (markerEnabled) {
        isDrawingRef.current = true;
        onMarkerStart(point);
        return;
      }

      if (!canControl) {
        return;
      }

      const button = e.button === 0 ? "left" : e.button === 2 ? "right" : "middle";
      const event: MouseDownEvent = { type: "mouse.down", button, x: point.x, y: point.y };
      if (adaptiveMode) {
        adaptiveQualityController.onInputEvent(event);
      }
      dataChannelManager.sendInput(event);
    },
    [canControl, getPoint, markerEnabled, onHoverPreview, onMarkerStart, fitToViewport, adaptiveMode]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
      if (markerEnabled || canControl) return;
      if (e.button !== 0) return;

      const point = getPoint(e.clientX, e.clientY);
      if (!point) return;

      useSessionStore.getState().setControlState("controlAllowed");
      dataChannelManager.sendControl({ type: "remoteControl.grabbed" });
      onHoverPreview(null);
    },
    [canControl, getPoint, markerEnabled, onHoverPreview],
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

      if (!canControl) return;

      const button = e.button === 0 ? "left" : e.button === 2 ? "right" : "middle";
      const event: MouseUpEvent = { type: "mouse.up", button, x: point.x, y: point.y };
      if (adaptiveMode) {
        adaptiveQualityController.onInputEvent(event);
      }
      dataChannelManager.sendInput(event);
    },
    [canControl, getPoint, markerEnabled, onMarkerEnd, adaptiveMode]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLVideoElement>) => {
      if (!canControl || markerEnabled) return;
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
    [canControl, getPoint, markerEnabled, wheelDirection, adaptiveMode]
  );

  const handleMouseLeave = useCallback(() => {
    isDrawingRef.current = false;
    isPanningRef.current = false;
    onMarkerEnd();
    onHoverPreview(null);
  }, [onHoverPreview, onMarkerEnd]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        display: fitToViewport ? "flex" : "block",
        alignItems: fitToViewport ? "center" : undefined,
        justifyContent: fitToViewport ? "center" : undefined,
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
          display: fitToViewport ? "inline-flex" : "block",
          flex: fitToViewport ? "0 0 auto" : undefined,
          margin: fitToViewport ? "auto" : undefined,
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
            cursor: markerEnabled ? "cell" : canControl ? "crosshair" : !fitToViewport ? "grab" : "default",
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
      </div>
    </div>
  );
}
