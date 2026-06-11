export function mbpsToString(mbps: number): string {
  if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`;
  return `${(mbps * 1000).toFixed(0)} Kbps`;
}

export function buildSenderParameters(
  sender: RTCRtpSender,
  bitrateMbps: number,
  fps: number
): RTCRtpSendParameters {
  const params = sender.getParameters();
  if (!params.encodings?.length) {
    params.encodings = [{}];
  }
  params.encodings[0].maxBitrate = bitrateMbps * 1_000_000;
  params.encodings[0].maxFramerate = fps;
  return params;
}

export async function applyBitrateConstraints(
  pc: RTCPeerConnection,
  bitrateMbps: number,
  fps: number
): Promise<void> {
  const senders = pc.getSenders();
  for (const sender of senders) {
    if (sender.track?.kind === "video") {
      const params = buildSenderParameters(sender, bitrateMbps, fps);
      await sender.setParameters(params);
    }
  }
}
