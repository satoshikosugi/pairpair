import type { ControlMessage, InputEvent } from "@pairpair/shared";
import { useSettingsStore } from "../store/settings-store";
import { useSessionStore } from "../store/session-store";
import { signalingClient } from "./signaling-client";
import { dataChannelManager } from "./data-channel";

let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let remoteStream: MediaStream | null = null;
let remoteVideoElement: HTMLVideoElement | null = null;
let hostInputHandler: ((event: InputEvent) => void) | null = null;
let hostControlHandler: ((message: ControlMessage) => void) | null = null;
let peerAuthenticated = false;

function attachRemoteStreamToElement(): void {
  if (!remoteVideoElement || !remoteStream) return;
  if (remoteVideoElement.srcObject !== remoteStream) {
    remoteVideoElement.srcObject = remoteStream;
  }
}

function getIceServers(): RTCIceServer[] {
  const stunServer = useSettingsStore.getState().stunServer;
  return [{ urls: [stunServer] }];
}

export async function createPeerConnectionAsHost(): Promise<RTCPeerConnection> {
  const pc = new RTCPeerConnection({
    iceServers: getIceServers(),
    iceTransportPolicy: "all",
  });

  peerConnection = pc;
  peerAuthenticated = false;

  dataChannelManager.setupAsHost(pc);

  if (hostInputHandler) {
    dataChannelManager.offInput(hostInputHandler);
  }
  hostInputHandler = async (event) => {
    const controlState = useSessionStore.getState().controlState;
    if (peerAuthenticated && controlState === "controlAllowed") {
      const injected = await window.pairpair.injectInput(event);
      if (!injected) {
        console.error("[PairPair] Failed to inject remote input event", event);
      }
    }
  };
  dataChannelManager.onInput(hostInputHandler);

  if (hostControlHandler) {
    dataChannelManager.offControl(hostControlHandler);
  }
  hostControlHandler = (message: ControlMessage) => {
    if (!peerAuthenticated) return;
    if (message.type === "remoteControl.request") {
      useSessionStore.getState().setControlState("controlRequested");
    } else if (message.type === "remoteControl.grabbed") {
      // Guest took control without waiting for approval
      useSessionStore.getState().setControlState("controlAllowed");
    } else if (message.type === "remoteControl.revoked") {
      useSessionStore.getState().setControlState("controlRevoked");
    } else if (message.type === "remoteControl.paused") {
      useSessionStore.getState().setControlState("controlPaused");
    } else if (message.type === "ping") {
      dataChannelManager.sendControl({ type: "pong", timestamp: message.timestamp });
    }
  };
  dataChannelManager.onControl(hostControlHandler);

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      signalingClient.send({
        type: "rtc.ice",
        payload: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid ?? null,
          sdpMLineIndex: event.candidate.sdpMLineIndex ?? null,
        },
      });
    }
  };

  pc.onconnectionstatechange = () => {
    useSessionStore.getState().setConnectionState(
      pc.connectionState as "idle" | "connecting" | "connected" | "disconnected" | "failed"
    );

    // When host closes connection, notify guest
    if (pc.connectionState === "closed" || pc.connectionState === "failed") {
      dataChannelManager.sendControl({ type: "session.ended" });
    }
  };

  pc.oniceconnectionstatechange = () => {
    useSessionStore.getState().setIceConnectionState(pc.iceConnectionState);
  };

  pc.onsignalingstatechange = () => {
    useSessionStore.getState().setSignalingState(pc.signalingState);
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  signalingClient.send({
    type: "rtc.offer",
    payload: { sdp: offer.sdp ?? "" },
  });

  return pc;
}

export async function startHostScreenShare(
  sourceId: string,
  qualityPreset?: import("@pairpair/shared").QualityPreset,
): Promise<void> {
  const pc = peerConnection;
  if (!pc) throw new Error("Peer connection is not ready");

  await window.pairpair.setSelectedSource(sourceId);
  const maxDim = qualityPreset ? Math.max(qualityPreset.width, qualityPreset.height) : 1920;
  localStream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { max: maxDim },
      height: { max: maxDim },
      frameRate: { ideal: qualityPreset?.fps ?? 30 },
      cursor: "always",
    } as MediaTrackConstraints,
  });

  localStream.getVideoTracks().forEach((track) => {
    (track as MediaStreamTrack & { contentHint: string }).contentHint = "detail";
    pc.addTransceiver(track, {
      direction: "sendonly",
      streams: [localStream!],
      sendEncodings: [{
        maxBitrate: (qualityPreset?.bitrateMbps ?? 5) * 1_000_000,
        maxFramerate: qualityPreset?.fps ?? 30,
        priority: "high",
      } as RTCRtpEncodingParameters],
    });
  });
  localStream.getAudioTracks().forEach((track) => {
    pc.addTrack(track, localStream!);
  });

  const videoCaps = RTCRtpSender.getCapabilities?.("video");
  if (videoCaps) {
    const preferred = ["video/vp9", "video/h264", "video/vp8"];
    const sortedCodecs = [
      ...preferred.flatMap((mime) => videoCaps.codecs.filter((c) => c.mimeType.toLowerCase() === mime)),
      ...videoCaps.codecs.filter((c) => !preferred.includes(c.mimeType.toLowerCase())),
    ];
    pc.getTransceivers()
      .filter((t) => t.sender.track?.kind === "video")
      .forEach((t) => {
        try { t.setCodecPreferences(sortedCodecs); } catch { /* unsupported */ }
      });
  }

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  signalingClient.send({ type: "rtc.offer", payload: { sdp: offer.sdp ?? "" } });
}

export function markPeerAuthenticated(): void {
  peerAuthenticated = true;
}

export async function createPeerConnectionAsGuest(): Promise<RTCPeerConnection> {
  const pc = new RTCPeerConnection({
    iceServers: getIceServers(),
    iceTransportPolicy: "all",
  });

  peerConnection = pc;

  dataChannelManager.setupAsGuest(pc);

  dataChannelManager.onControl((message: ControlMessage) => {
    if (message.type === "remoteControl.granted") {
      useSessionStore.getState().setControlState("controlAllowed");
    } else if (message.type === "remoteControl.revoked") {
      useSessionStore.getState().setControlState("controlRevoked");
    } else if (message.type === "remoteControl.paused") {
      useSessionStore.getState().setControlState("controlPaused");
    }
  });

  dataChannelManager.onSessionEnded(() => {
    useSessionStore.getState().emitSessionEnded();
  });

  pc.ontrack = (event) => {
    if (!event.streams[0]) return;
    remoteStream = event.streams[0];
    attachRemoteStreamToElement();
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      signalingClient.send({
        type: "rtc.ice",
        payload: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid ?? null,
          sdpMLineIndex: event.candidate.sdpMLineIndex ?? null,
        },
      });
    }
  };

  pc.onconnectionstatechange = () => {
    useSessionStore.getState().setConnectionState(
      pc.connectionState as "idle" | "connecting" | "connected" | "disconnected" | "failed"
    );
  };

  pc.oniceconnectionstatechange = () => {
    useSessionStore.getState().setIceConnectionState(pc.iceConnectionState);
  };

  return pc;
}

export async function handleOffer(sdp: string): Promise<void> {
  if (!peerConnection) return;
  await peerConnection.setRemoteDescription({ type: "offer", sdp });
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  signalingClient.send({ type: "rtc.answer", payload: { sdp: answer.sdp ?? "" } });
}

export async function handleAnswer(sdp: string): Promise<void> {
  if (!peerConnection) return;
  await peerConnection.setRemoteDescription({ type: "answer", sdp });
}

export async function handleIce(candidate: string, sdpMid: string | null, sdpMLineIndex: number | null): Promise<void> {
  if (!peerConnection) return;
  try {
    await peerConnection.addIceCandidate({ candidate, sdpMid, sdpMLineIndex });
  } catch (err) {
    console.warn("Failed to add ICE candidate:", err);
  }
}

export function closePeerConnection(): void {
  if (hostInputHandler) {
    dataChannelManager.offInput(hostInputHandler);
    hostInputHandler = null;
  }
  if (hostControlHandler) {
    dataChannelManager.offControl(hostControlHandler);
    hostControlHandler = null;
  }
  dataChannelManager.close();
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  remoteStream = null;
  if (remoteVideoElement) {
    remoteVideoElement.srcObject = null;
  }
  peerConnection?.close();
  peerConnection = null;
  peerAuthenticated = false;
}

export function getPeerConnection(): RTCPeerConnection | null {
  return peerConnection;
}

export function bindRemoteVideoElement(element: HTMLVideoElement | null): void {
  remoteVideoElement = element;
  if (!remoteVideoElement) return;
  attachRemoteStreamToElement();
}

/**
 * Returns the actual resolution of the captured video track.
 * Must be called after createPeerConnectionAsHost() succeeds.
 * Use this (not preset dimensions) for bitrate calculations — the screen
 * may be portrait or a resolution that differs from the chosen preset.
 */
export function getLocalStreamResolution(): { width: number; height: number } | null {
  if (!localStream) return null;
  const settings = localStream.getVideoTracks()[0]?.getSettings();
  if (!settings?.width || !settings?.height) return null;
  return { width: settings.width, height: settings.height };
}

export async function applyQualityPreset(preset: import("@pairpair/shared").QualityPreset): Promise<void> {
  const pc = getPeerConnection();
  if (!pc) return;

  const senders = pc.getSenders();
  let hasVideo = false;

  for (const sender of senders) {
    if (sender.track?.kind === "video") {
      hasVideo = true;
      // Use the long edge of the preset as max for both axes.
      // This keeps portrait captures at their native resolution.
      if (sender.track) {
        try {
          const maxDim = Math.max(preset.width, preset.height);
          await sender.track.applyConstraints({
            width:     { max: maxDim },
            height:    { max: maxDim },
            frameRate: { ideal: preset.fps },
          });
        } catch (err) {
          console.warn("Failed to apply constraints to video track:", err);
        }
      }

      // Then apply bitrate and FPS through RTC parameters
      try {
        const params = sender.getParameters();
        if (!params.encodings?.length) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = preset.bitrateMbps * 1_000_000;
        params.encodings[0].maxFramerate = preset.fps;
        params.degradationPreference = "maintain-resolution";
        await sender.setParameters(params);
      } catch (err) {
        console.warn("Failed to set RTC parameters:", err);
      }
    }
  }

  if (!hasVideo) {
    console.warn("No video sender found to apply quality preset");
  }
}

export async function setAdaptiveParameters(fps: number, bitrateMbps: number): Promise<void> {
  const pc = getPeerConnection();
  if (!pc) return;
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind === "video") {
      // Throttle via encoder parameters only (no applyConstraints — avoids stream disruption)
      try {
        const params = sender.getParameters();
        if (!params.encodings?.length) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = bitrateMbps * 1_000_000;
        params.encodings[0].maxFramerate = fps;
        // maintain-resolution: under bandwidth pressure, reduce FPS instead of resolution
        // This is critical for text/code legibility in screen sharing
        params.degradationPreference = "maintain-resolution";
        await sender.setParameters(params);
      } catch (err) {
        console.warn("Failed to set adaptive parameters:", err);
      }
    }
  }
}

export function getAvailableVideoCodecs(): RTCRtpCodecCapability[] {
  const capabilities = RTCRtpSender.getCapabilities?.("video");
  return capabilities?.codecs ?? [];
}

export async function preferCodec(codecMimeType: string): Promise<void> {
  const pc = getPeerConnection();
  if (!pc) return;
  const transceivers = pc.getTransceivers();
  for (const transceiver of transceivers) {
    if (transceiver.sender.track?.kind === "video") {
      const caps = RTCRtpSender.getCapabilities?.("video");
      if (!caps) return;
      const preferred = caps.codecs.filter(
        (c) => c.mimeType.toLowerCase() === codecMimeType.toLowerCase(),
      );
      const rest = caps.codecs.filter(
        (c) => c.mimeType.toLowerCase() !== codecMimeType.toLowerCase(),
      );
      transceiver.setCodecPreferences([...preferred, ...rest]);
    }
  }
}

/**
 * Switch screen source during an active session.
 * Replaces the current video track with a new one from the specified source.
 */
export async function switchScreenSource(sourceId: string): Promise<void> {
  if (!peerConnection || !localStream) {
    throw new Error("No active peer connection or local stream");
  }

  try {
    // Get new stream from the specified source
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
          maxWidth: 3840,
          maxHeight: 2160,
        },
      } as unknown as MediaTrackConstraints,
    } as MediaStreamConstraints);

    // Get the new video track
    const newVideoTrack = newStream.getVideoTracks()[0];
    if (!newVideoTrack) {
      throw new Error("No video track in new stream");
    }

    // Get sender for current video track
    const senders = peerConnection.getSenders();
    const videoSender = senders.find((sender) => sender.track?.kind === "video");

    if (videoSender) {
      // Replace the track
      await videoSender.replaceTrack(newVideoTrack);
    } else {
      // If no video sender exists, add it (shouldn't happen in normal flow)
      await peerConnection.addTrack(newVideoTrack, newStream);
    }

    // Stop old video tracks
    const oldVideoTracks = localStream.getVideoTracks();
    for (const track of oldVideoTracks) {
      track.stop();
      localStream.removeTrack(track);
    }

    // Add new track to local stream
    localStream.addTrack(newVideoTrack);

    console.log("[PairPair] Screen source switched successfully");
  } catch (err) {
    console.error("[PairPair] Failed to switch screen source:", err);
    throw err;
  }
}
