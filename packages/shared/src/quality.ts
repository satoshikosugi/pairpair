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
    bitrateMbps: 2,
  },
  Balanced: {
    name: "Balanced",
    resolution: "1920x1080",
    width: 1920,
    height: 1080,
    fps: 30,
    bitrateMbps: 6,
  },
  Sharp: {
    name: "Sharp",
    resolution: "2560x1440",
    width: 2560,
    height: 1440,
    fps: 30,
    bitrateMbps: 12,
  },
  Ultra: {
    name: "Ultra",
    resolution: "3840x2160",
    width: 3840,
    height: 2160,
    fps: 30,
    bitrateMbps: 25,
  },
};

export const DEFAULT_QUALITY_PRESET: QualityPreset = QUALITY_PRESETS.Balanced;
