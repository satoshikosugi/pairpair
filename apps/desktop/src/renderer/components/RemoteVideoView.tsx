import React, { useRef, useCallback, useEffect } from "react";
import type { MouseMoveEvent, MouseDownEvent, MouseUpEvent, MouseWheelEvent } from "@pairpair/shared";
import { toNormalizedCoordinate } from "../utils/coordinate";
import { useSessionStore } from "../store/session-store";
import { dataChannelManager } from "../webrtc/data-channel";
// Note: useSessionStore is used directly (not via hook) for non-render state updates

const MOUSE_MOVE_INTERVAL_MS = 16;

interface RemoteVideoViewProps {
  stream?: MediaStream;
}

export function RemoteVideoView({ stream }: RemoteVideoViewProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastMouseMoveTime = useRef(0);
  const lastMousePos = useRef({ x: -1, y: -1 });
  const { controlState } = useSessionStore();
  const canControl = controlState === "controlAllowed";

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
      if (!canControl || !videoRef.current) return;
      const now = Date.now();
      if (now - lastMouseMoveTime.current < MOUSE_MOVE_INTERVAL_MS) return;

      const coords = toNormalizedCoordinate(videoRef.current, e.clientX, e.clientY);
      if (!coords) return;

      if (
        Math.abs(coords.x - lastMousePos.current.x) < 0.001 &&
        Math.abs(coords.y - lastMousePos.current.y) < 0.001
      ) {
        return;
      }

      lastMouseMoveTime.current = now;
      lastMousePos.current = coords;

      const event: MouseMoveEvent = {
        type: "mouse.move",
        x: coords.x,
        y: coords.y,
        screenId: "primary",
        timestamp: now,
      };
      dataChannelManager.sendInput(event);
    },
    [canControl]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
      if (!videoRef.current) return;
      // Click-to-control: take control on first click without needing host approval
      if (!canControl) {
        useSessionStore.getState().setControlState("controlAllowed");
        dataChannelManager.sendControl({ type: "remoteControl.grabbed" });
        return;
      }
      const coords = toNormalizedCoordinate(videoRef.current, e.clientX, e.clientY);
      if (!coords) return;
      const button = e.button === 0 ? "left" : e.button === 2 ? "right" : "middle";
      const event: MouseDownEvent = { type: "mouse.down", button, x: coords.x, y: coords.y };
      dataChannelManager.sendInput(event);
    },
    [canControl]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
      if (!canControl || !videoRef.current) return;
      const coords = toNormalizedCoordinate(videoRef.current, e.clientX, e.clientY);
      if (!coords) return;

      const button = e.button === 0 ? "left" : e.button === 2 ? "right" : "middle";
      const event: MouseUpEvent = { type: "mouse.up", button, x: coords.x, y: coords.y };
      dataChannelManager.sendInput(event);
    },
    [canControl]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLVideoElement>) => {
      if (!canControl || !videoRef.current) return;
      e.preventDefault();
      const coords = toNormalizedCoordinate(videoRef.current, e.clientX, e.clientY);
      if (!coords) return;

      const event: MouseWheelEvent = {
        type: "mouse.wheel",
        deltaX: Math.round(e.deltaX),
        deltaY: Math.round(e.deltaY),
        x: coords.x,
        y: coords.y,
      };
      dataChannelManager.sendInput(event);
    },
    [canControl]
  );

  return (
    <div
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#000" }}
    >
      <video
        ref={videoRef}
        id="remote-video"
        autoPlay
        muted
        playsInline
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          cursor: canControl ? "crosshair" : "default",
        }}
      />
    </div>
  );
}
