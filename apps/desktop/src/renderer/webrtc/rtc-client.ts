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
    // Use the LONG EDGE of the preset as the max for both dimensions.
    // This correctly handles portrait screens: a 1080x1920 screen with
    // Balanced (1920x1080) gets maxDim=1920, so width=1080 and height=1920
    // are both within the limit and captured at full native resolution.
    // Plain `max: {width: preset.width, height: preset.height}` would force
    // portrait screens into 608x1080 (aspect-ratio-preserved downscale).
    const maxDim = qualityPreset
      ? Math.max(qualityPreset.width, qualityPreset.height)
      : 1920;
    const videoConstraints = {
      width:     { max: maxDim },
      height:    { max: maxDim },
      frameRate: { ideal: qualityPreset?.fps ?? 30 },
    };

    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: videoConstraints,
    });

    // Set detail hint: tells Chrome's encoder to optimize for sharpness (text/UI)
    // rather than motion smoothness. This is the most impactful fix for blurry screen sharing.
    localStream.getVideoTracks().forEach((track) => {
      (track as MediaStreamTrack & { contentHint: string }).contentHint = "detail";
    });

    // Use addTransceiver (not addTrack) so that encodings are always
    // populated in getParameters(), making setParameters() reliable.
    const initialBitrate = qualityPreset
      ? qualityPreset.bitrateMbps * 1_000_000
      : 5_000_000;
    const initialFps = qualityPreset ? qualityPreset.fps : 30;
    localStream.getVideoTracks().forEach((track) => {
      pc.addTransceiver(track, {
        direction: "sendonly",
        streams: [localStream!],
        sendEncodings: [{
          maxBitrate: initialBitrate,
          maxFramerate: initialFps,
          priority: "high",
          // Note: scalabilityMode (L1T1) intentionally omitted — H.264 (our preferred codec)
          // does not support SVC scalabilityMode and it causes encoding artifacts.
        } as RTCRtpEncodingParameters],
      });
    });
    // Non-video tracks added normally
    localStream.getAudioTracks().forEach((track) => {
      pc.addTrack(track, localStream!);
    });

    // VP9 is prioritised over H.264 for screen content:
    // - VP9 (libvpx) activates a dedicated "screen content coding" mode when
    //   contentHint="detail" is set, producing sharp text at the same bitrate.
    // - H.264 HW encoders (MediaFoundation) are optimised for camera motion
    //   and lack an equivalent screen-content mode.
    // MUST be set BEFORE createOffer so the SDP reflects the preference.
    const videoCaps = RTCRtpSender.getCapabilities?.("video");
    if (videoCaps) {
      const preferred = ["video/vp9", "video/h264", "video/vp8"];
      const sortedCodecs = [
        ...preferred.flatMap((mime) =>
          videoCaps.codecs.filter((c) => c.mimeType.toLowerCase() === mime)
        ),
        ...videoCaps.codecs.filter(
          (c) => !preferred.includes(c.mimeType.toLowerCase())
        ),
      ];
      pc.getTransceivers()
        .filter((t) => t.sender.track?.kind === "video")
        .forEach((t) => {
          try { t.setCodecPreferences(sortedCodecs); } catch { /* unsupported */ }
        });
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
