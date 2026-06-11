/**
 * Convert client mouse position within a video element to normalized coordinates (0.0 - 1.0),
 * accounting for letterbox/pillarbox areas.
 */
export function toNormalizedCoordinate(
  videoElement: HTMLVideoElement,
  clientX: number,
  clientY: number
): { x: number; y: number } | null {
  const rect = videoElement.getBoundingClientRect();
  const elemWidth = rect.width;
  const elemHeight = rect.height;

  const videoWidth = videoElement.videoWidth;
  const videoHeight = videoElement.videoHeight;

  if (!videoWidth || !videoHeight || !elemWidth || !elemHeight) {
    return null;
  }

  const videoAspect = videoWidth / videoHeight;
  const elemAspect = elemWidth / elemHeight;

  let videoOffsetX = 0;
  let videoOffsetY = 0;
  let videoRenderWidth = elemWidth;
  let videoRenderHeight = elemHeight;

  if (videoAspect > elemAspect) {
    videoRenderHeight = elemWidth / videoAspect;
    videoOffsetY = (elemHeight - videoRenderHeight) / 2;
  } else {
    videoRenderWidth = elemHeight * videoAspect;
    videoOffsetX = (elemWidth - videoRenderWidth) / 2;
  }

  const relX = clientX - rect.left;
  const relY = clientY - rect.top;

  if (
    relX < videoOffsetX ||
    relX > videoOffsetX + videoRenderWidth ||
    relY < videoOffsetY ||
    relY > videoOffsetY + videoRenderHeight
  ) {
    return null;
  }

  const x = (relX - videoOffsetX) / videoRenderWidth;
  const y = (relY - videoOffsetY) / videoRenderHeight;

  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  };
}
