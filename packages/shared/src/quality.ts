export type QualityPresetName = "Low" | "Balanced" | "Sharp" | "Ultra" | "Custom";

export interface QualityPreset {
  name: QualityPresetName;
  resolution: string;
  width: number;
  height: number;
  fps: number;
  bitrateMbps: number;
}

export const QUALITY_PRESETS: Record<Exclude<QualityPresetName, "Custom">, QualityPreset> = {
  Low: {
    name: "Low",
    resolution: "1280x720",
    width: 1280,
    height: 720,
    fps: 15,
    bitrateMbps: 4,
  },
  Balanced: {
    name: "Balanced",
    resolution: "1920x1080",
    width: 1920,
    height: 1080,
    fps: 30,
    bitrateMbps: 15,
  },
  Sharp: {
    name: "Sharp",
    resolution: "2560x1440",
    width: 2560,
    height: 1440,
    fps: 30,
    bitrateMbps: 25,
  },
  Ultra: {
    name: "Ultra",
    resolution: "3840x2160",
    width: 3840,
    height: 2160,
    fps: 30,
    bitrateMbps: 50,
  },
};

export const DEFAULT_QUALITY_PRESET: QualityPreset = QUALITY_PRESETS.Balanced;

// --- PairPro Adaptive Quality ---

export type PairProActivityState =
  | "idle"
  | "mouse_moving"
  | "scrolling"
  | "typing"
  | "clicking";

export interface PairProProfile {
  fps: number;
  /** Encoder compression quality 1–100. Higher = better image quality per frame. */
  quality: number;
  idleTimeoutMs: number;
}

/**
 * Calculate target bitrate (Mbps) from quality%, resolution, and fps.
 * Targets ~20 Mbps at quality=100, 1080p, 30fps — suitable for crisp screen content.
 */
export function calcBitrateMbps(
  quality: number,
  width: number,
  height: number,
  fps: number,
): number {
  const pixelScale = (width * height) / (1920 * 1080);
  // (fps * 0.6 + 2) gives ~20 at fps=30, ~11 at fps=15, ~2.6 at fps=1
  const raw = (quality / 100) * pixelScale * (fps * 0.6 + 2);
  return Math.round(raw * 10) / 10;
}

export const PAIRPRO_DEFAULT_PROFILES: Record<PairProActivityState, PairProProfile> = {
  idle:         { fps: 1,  quality: 30, idleTimeoutMs: 2000 },
  mouse_moving: { fps: 15, quality: 60, idleTimeoutMs: 500  },
  scrolling:    { fps: 20, quality: 70, idleTimeoutMs: 300  },
  typing:       { fps: 5,  quality: 50, idleTimeoutMs: 1000 },
  clicking:     { fps: 30, quality: 80, idleTimeoutMs: 300  },
};
