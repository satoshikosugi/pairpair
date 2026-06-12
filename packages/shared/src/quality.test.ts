import { describe, it, expect } from "vitest";
import { calcBitrateMbps, QUALITY_PRESETS, PAIRPRO_DEFAULT_PROFILES } from "@pairpair/shared";

/**
 * Test Suite: Adaptive Quality Bitrate Calculation
 * 
 * Tests the bitrate formula used in adaptive quality mode
 */
describe("Bitrate Calculation", () => {
  describe("calcBitrateMbps", () => {
    it("should calculate bitrate for Balanced 1920x1080 at quality=100, 30fps", () => {
      const mbps = calcBitrateMbps(100, 1920, 1080, 30);
      
      // Expected: (100/100) * pixelScale * (30*0.6 + 2)
      // pixelScale = 1920*1080/(1920*1080) = 1.0 for base resolution
      // = 1.0 * (18 + 2) = 20 Mbps
      expect(mbps).toBeCloseTo(20, 0);
    });

    it("should calculate bitrate for quality=80, 30fps at 1920x1080", () => {
      const mbps = calcBitrateMbps(80, 1920, 1080, 30);
      
      // = (80/100) * 1.0 * 20 = 16 Mbps
      expect(mbps).toBeCloseTo(16, 0);
    });

    it("should calculate bitrate for quality=30, 1fps at 1920x1080 (idle)", () => {
      const mbps = calcBitrateMbps(30, 1920, 1080, 1);
      
      // = (30/100) * 1.0 * (1*0.6 + 2) = 0.3 * 2.6 = 0.78 Mbps
      expect(mbps).toBeCloseTo(0.78, 1);
    });

    it("should scale with resolution", () => {
      const bitrate1080 = calcBitrateMbps(60, 1920, 1080, 30);
      const bitrate2160 = calcBitrateMbps(60, 3840, 2160, 30);
      
      // 4K has 4x pixels, should have ~4x bitrate
      const ratio = bitrate2160 / bitrate1080;
      expect(ratio).toBeCloseTo(4, 0);
    });

    it("should increase with FPS", () => {
      const bitrate1fps = calcBitrateMbps(60, 1920, 1080, 1);
      const bitrate30fps = calcBitrateMbps(60, 1920, 1080, 30);
      
      // Should increase with FPS
      expect(bitrate30fps).toBeGreaterThan(bitrate1fps);
    });

    it("should be zero or near-zero for quality=0", () => {
      const mbps = calcBitrateMbps(0, 1920, 1080, 30);
      expect(mbps).toBeLessThan(1);
    });

    it("should handle extreme FPS values", () => {
      const bitrate60fps = calcBitrateMbps(100, 1920, 1080, 60);
      const bitrate1fps = calcBitrateMbps(100, 1920, 1080, 1);
      
      expect(bitrate60fps).toBeGreaterThan(bitrate1fps);
      expect(bitrate60fps).toBeLessThan(100); // Sanity check
    });
  });

  describe("PairPro Profile Bitrates", () => {
    it("should calculate correct bitrate for idle profile at Balanced", () => {
      const profile = PAIRPRO_DEFAULT_PROFILES.idle;
      const preset = QUALITY_PRESETS.Balanced;
      
      const bitrate = calcBitrateMbps(
        profile.quality,
        preset.width,
        preset.height,
        profile.fps
      );
      
      // Idle: quality=30%, fps=1, should be ~0.8 Mbps
      expect(bitrate).toBeCloseTo(0.8, 0);
    });

    it("should calculate correct bitrate for mouse_moving profile", () => {
      const profile = PAIRPRO_DEFAULT_PROFILES.mouse_moving;
      const preset = QUALITY_PRESETS.Balanced;
      
      const bitrate = calcBitrateMbps(
        profile.quality,
        preset.width,
        preset.height,
        profile.fps
      );
      
      // mouse_moving: quality=60%, fps=15, should be ~7.8 Mbps
      expect(bitrate).toBeCloseTo(7.8, 0);
    });

    it("should calculate correct bitrate for scrolling profile", () => {
      const profile = PAIRPRO_DEFAULT_PROFILES.scrolling;
      const preset = QUALITY_PRESETS.Balanced;
      
      const bitrate = calcBitrateMbps(
        profile.quality,
        preset.width,
        preset.height,
        profile.fps
      );
      
      // scrolling: quality=70%, fps=20, should be ~10.9 Mbps
      expect(bitrate).toBeCloseTo(10.9, 0);
    });

    it("should calculate correct bitrate for typing profile", () => {
      const profile = PAIRPRO_DEFAULT_PROFILES.typing;
      const preset = QUALITY_PRESETS.Balanced;
      
      const bitrate = calcBitrateMbps(
        profile.quality,
        preset.width,
        preset.height,
        profile.fps
      );
      
      // typing: quality=50%, fps=5, should be ~3.2 Mbps
      expect(bitrate).toBeCloseTo(3.2, 0);
    });

    it("should calculate correct bitrate for clicking profile", () => {
      const profile = PAIRPRO_DEFAULT_PROFILES.clicking;
      const preset = QUALITY_PRESETS.Balanced;
      
      const bitrate = calcBitrateMbps(
        profile.quality,
        preset.width,
        preset.height,
        profile.fps
      );
      
      // clicking: quality=80%, fps=30, should be ~15.6 Mbps
      expect(bitrate).toBeCloseTo(15.6, 0);
    });
  });

  describe("Quality Preset Validation", () => {
    it("should have all presets with valid resolution and bitrate", () => {
      for (const [name, preset] of Object.entries(QUALITY_PRESETS)) {
        expect(preset.width).toBeGreaterThan(0);
        expect(preset.height).toBeGreaterThan(0);
        expect(preset.bitrateMbps).toBeGreaterThan(0);
        expect(name).toBeDefined();
      }
    });

    it("should have resolution > bitrate relationship (Low < Balanced < Sharp < Ultra)", () => {
      const names = ["Low", "Balanced", "Sharp", "Ultra"] as const;
      
      for (let i = 0; i < names.length - 1; i++) {
        const current = QUALITY_PRESETS[names[i]];
        const next = QUALITY_PRESETS[names[i + 1]];
        
        expect(next.width * next.height).toBeGreaterThan(
          current.width * current.height
        );
        expect(next.bitrateMbps).toBeGreaterThan(current.bitrateMbps);
      }
    });

    it("should have bitrates >= 4 Mbps for minimum quality", () => {
      const minBitrate = Math.min(...Object.values(QUALITY_PRESETS).map(p => p.bitrateMbps));
      expect(minBitrate).toBeGreaterThanOrEqual(4);
    });
  });
});
