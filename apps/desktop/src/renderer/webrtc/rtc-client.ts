import type { ControlMessage } from "@pairpair/shared";
import { useSettingsStore } from "../store/settings-store";
import { useSessionStore } from "../store/session-store";
import { signalingClient } from "./signaling-client";
import { dataChannelManager } from "./data-channel";

let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;

function getIceServers(): RTCIceServer[] {
  const stunServer = useSettingsStore.getState().stunServer;
  return [{ urls: [stunServer] }];
}

export async function createPeerConnectionAsHost(sourceId: string, qualityPreset?: import("@pairpair/shared").QualityPreset): Promise<RTCPeerConnection> {
  const pc = new RTCPeerConnection({
    iceServers: getIceServers(),
    iceTransportPolicy: "all",
  });

  peerConnection = pc;

  dataChannelManager.setupAsHost(pc);

  dataChannelManager.onInput(async (event) => {
    const controlState = useSessionStore.getState().controlState;
    if (controlState === "controlAllowed") {
      await window.pairpair.injectInput(event);
    }
  });

  dataChannelManager.onControl((message: ControlMessage) => {
    if (message.type === "remoteControl.request") {
      useSessionStore.getState().setControlState("controlRequested");
    } else if (message.type === "remoteControl.grabbed") {
      // Guest took control without waiting for approval
      useSessionStore.getState().setControlState("controlAllowed");
    } else if (message.type === "ping") {
      dataChannelManager.sendControl({ type: "pong", timestamp: message.timestamp });
    }
  });

  // Tell main process which source to use before getDisplayMedia fires
  await window.pairpair.setSelectedSource(sourceId);

  try {
    // Use the quality preset constraints if provided, otherwise use defaults
    const videoConstraints = qualityPreset ? {
      width: { ideal: qualityPreset.width },
      height: { ideal: qualityPreset.height },
      frameRate: { ideal: qualityPreset.fps },
    } : {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
    };

    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: videoConstraints,
    });

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream!);
    });

    // Apply quality preset to the RTC sender after track is added
    if (qualityPreset) {
      // Give the track a moment to be set up before applying parameters
      await new Promise(resolve => setTimeout(resolve, 100));
      await applyQualityPreset(qualityPreset).catch(console.warn);
    }
  } catch (err) {
    console.error("Failed to get display media:", err);
    throw err;
  }

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
    const videoEl = document.getElementById("remote-video") as HTMLVideoElement | null;
    if (videoEl && event.streams[0]) {
      videoEl.srcObject = event.streams[0];
    }
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
  dataChannelManager.close();
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  peerConnection?.close();
  peerConnection = null;
}

export function getPeerConnection(): RTCPeerConnection | null {
  return peerConnection;
}

export async function applyQualityPreset(preset: import("@pairpair/shared").QualityPreset): Promise<void> {
  const pc = getPeerConnection();
  if (!pc) return;

  const senders = pc.getSenders();
  let hasVideo = false;

  for (const sender of senders) {
    if (sender.track?.kind === "video") {
      hasVideo = true;
      // First, try to apply constraints to the track for resolution changes
      if (sender.track) {
        try {
          await sender.track.applyConstraints({
            width: { ideal: preset.width },
            height: { ideal: preset.height },
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
