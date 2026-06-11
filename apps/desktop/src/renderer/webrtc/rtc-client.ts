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

export async function createPeerConnectionAsHost(_sourceId: string): Promise<RTCPeerConnection> {
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
    } else if (message.type === "ping") {
      dataChannelManager.sendControl({ type: "pong", timestamp: message.timestamp });
    }
  });

  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
    });

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream!);
    });
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
