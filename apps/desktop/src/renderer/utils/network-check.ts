export interface NetworkDiagnostics {
  canReachStun: boolean;
  hasCandidates: boolean;
  status: "ok" | "limited" | "unknown";
  message: string;
}

export async function checkP2PCapability(stunServer: string): Promise<NetworkDiagnostics> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({
        canReachStun: false,
        hasCandidates: false,
        status: "unknown",
        message: "診断タイムアウト",
      });
    }, 10000);

    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: [stunServer] }] });
      let hasSrflx = false;
      let hasCandidates = false;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          hasCandidates = true;
          if (event.candidate.type === "srflx") {
            hasSrflx = true;
            clearTimeout(timeout);
            pc.close();
            resolve({ canReachStun: true, hasCandidates: true, status: "ok", message: "P2P接続可能" });
          }
        }
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(timeout);
          pc.close();
          if (!hasSrflx) {
            resolve({
              canReachStun: hasCandidates,
              hasCandidates,
              status: "limited",
              message: hasCandidates ? "P2P接続可能（制限あり）" : "P2P接続に問題がある可能性があります",
            });
          }
        }
      };

      pc.createDataChannel("test");
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => {
          clearTimeout(timeout);
          pc.close();
          resolve({ canReachStun: false, hasCandidates: false, status: "limited", message: "ネットワーク診断に失敗しました" });
        });
    } catch {
      clearTimeout(timeout);
      resolve({ canReachStun: false, hasCandidates: false, status: "unknown", message: "診断を実行できませんでした" });
    }
  });
}
