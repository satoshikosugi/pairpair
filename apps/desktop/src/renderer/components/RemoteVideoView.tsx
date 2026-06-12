import React, { useRef, useCallback, useEffect } from "react";
import type { AnnotationPoint, AnnotationStroke, GuestCursorIndicator, MouseDownEvent, MouseMoveEvent, MouseUpEvent, MouseWheelEvent } from "@pairpair/shared";
import { toNormalizedCoordinate } from "../utils/coordinate";
import { useSessionStore } from "../store/session-store";
import { dataChannelManager } from "../webrtc/data-channel";

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
}: RemoteVideoViewProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastMouseMoveTime = useRef(0);
  const lastMousePos = useRef({ x: -1, y: -1 });
  const isDrawingRef = useRef(false);
  const { controlState } = useSessionStore();
  const canControl = controlState === "controlAllowed";

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const getPoint = useCallback((clientX: number, clientY: number): AnnotationPoint | null => {
    if (!videoRef.current) return null;
    return toNormalizedCoordinate(videoRef.current, clientX, clientY);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
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
      dataChannelManager.sendInput(event);
    },
    [canControl, getPoint, markerEnabled, onHoverPreview, onMarkerMove]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
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
      dataChannelManager.sendInput(event);
    },
    [canControl, getPoint, markerEnabled, onHoverPreview, onMarkerStart]
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
      dataChannelManager.sendInput(event);
    },
    [canControl, getPoint, markerEnabled, onMarkerEnd]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLVideoElement>) => {
      if (!canControl || markerEnabled) return;
      const point = getPoint(e.clientX, e.clientY);
      if (!point) return;

      e.preventDefault();
      const event: MouseWheelEvent = {
        type: "mouse.wheel",
        deltaX: Math.round(e.deltaX),
        deltaY: Math.round(e.deltaY),
        x: point.x,
        y: point.y,
      };
      dataChannelManager.sendInput(event);
    },
    [canControl, getPoint, markerEnabled]
  );

  const handleMouseLeave = useCallback(() => {
    isDrawingRef.current = false;
    onMarkerEnd();
    onHoverPreview(null);
  }, [onHoverPreview, onMarkerEnd]);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#000",
        padding: fullscreen ? 0 : 12,
      }}
    >
      <div style={{ position: "relative", display: "inline-flex", maxWidth: "100%", maxHeight: "100%" }}>
        <video
          ref={videoRef}
          id="remote-video"
          data-remote="true"
          autoPlay
          muted
          playsInline
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          onWheel={handleWheel}
          onMouseLeave={handleMouseLeave}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            cursor: markerEnabled ? "cell" : canControl ? "crosshair" : "default",
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
