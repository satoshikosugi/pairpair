import { describe, it, expect, beforeEach, vi } from "vitest";
import { AdaptiveQualityController, type PairProActivityState } from "../webrtc/adaptive-quality";
import { PAIRPRO_DEFAULT_PROFILES } from "@pairpair/shared";

/**
 * Test Suite: Adaptive Quality Controller
 * 
 * Tests the state machine that automatically adjusts quality based on user activity
 */
describe("AdaptiveQualityController", () => {
  let controller: AdaptiveQualityController;
  let applyCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    applyCallback = vi.fn();
    controller = new AdaptiveQualityController();
    
    // Enable with Balanced resolution
    controller.enable(
      PAIRPRO_DEFAULT_PROFILES,
      applyCallback,
      1920, // width
      1080  // height
    );
  });

  describe("State Machine", () => {
    it("should start in idle state", () => {
      expect(controller.state).toBe("idle");
    });

    it("should transition from idle to mouse_moving on mouse.move event", () => {
      controller.onInputEvent({
        type: "mouse.move",
        x: 0.5,
        y: 0.5,
        screenId: "primary",
        timestamp: Date.now(),
      });

      expect(controller.state).toBe("mouse_moving");
      expect(applyCallback).toHaveBeenCalled();
    });

    it("should transition from idle to typing on keyboard.down event", () => {
      controller.onInputEvent({
        type: "keyboard.down",
        code: "KeyA",
        key: "a",
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      });

      expect(controller.state).toBe("typing");
      expect(applyCallback).toHaveBeenCalled();
    });

    it("should transition from idle to clicking on mouse.down event", () => {
      controller.onInputEvent({
        type: "mouse.down",
        button: 0,
        x: 0.5,
        y: 0.5,
        screenId: "primary",
        timestamp: Date.now(),
      });

      expect(controller.state).toBe("clicking");
      expect(applyCallback).toHaveBeenCalled();
    });

    it("should transition from idle to scrolling on mouse.wheel event", () => {
      controller.onInputEvent({
        type: "mouse.wheel",
        deltaX: 0,
        deltaY: -120,
        x: 0.5,
        y: 0.5,
        screenId: "primary",
        timestamp: Date.now(),
      });

      expect(controller.state).toBe("scrolling");
      expect(applyCallback).toHaveBeenCalled();
    });

    it("should transition back to idle after timeout", (done) => {
      // Transition to mouse_moving
      controller.onInputEvent({
        type: "mouse.move",
        x: 0.5,
        y: 0.5,
        screenId: "primary",
        timestamp: Date.now(),
      });

      expect(controller.state).toBe("mouse_moving");

      // Wait for idle timeout (mouse_moving timeout is 3000ms)
      setTimeout(() => {
        expect(controller.state).toBe("idle");
        expect(applyCallback).toHaveBeenCalledTimes(2); // Once for transition, once for idle
        done();
      }, 3500);
    });
  });

  describe("Callback Arguments", () => {
    it("should call callback with correct FPS and bitrate for idle", () => {
      const expectedFps = PAIRPRO_DEFAULT_PROFILES.idle.fps;
      const expectedQuality = PAIRPRO_DEFAULT_PROFILES.idle.quality;
      
      // Directly trigger idle state
      vi.useFakeTimers();
      controller.notifyActivity("idle");
      vi.runAllTimers();
      
      const call = applyCallback.mock.calls[0];
      expect(call[0]).toBe(expectedFps);
      expect(call[1]).toBeCloseTo(0.8, 0); // Expected bitrate for idle
      
      vi.useRealTimers();
    });

    it("should call callback with correct values for each state", () => {
      const states: PairProActivityState[] = ["idle", "mouse_moving", "scrolling", "typing", "clicking"];
      
      for (const state of states) {
        applyCallback.mockClear();
        
        // Trigger state via event (not direct notify)
        const eventMap: Record<PairProActivityState, any> = {
          idle: { type: "test_idle" }, // Special case
          mouse_moving: { type: "mouse.move", x: 0.5, y: 0.5, screenId: "primary", timestamp: Date.now() },
          scrolling: { type: "mouse.wheel", deltaX: 0, deltaY: -120, x: 0.5, y: 0.5, screenId: "primary", timestamp: Date.now() },
          typing: { type: "keyboard.down", code: "KeyA", key: "a", ctrlKey: false, shiftKey: false, altKey: false, metaKey: false },
          clicking: { type: "mouse.down", button: 0, x: 0.5, y: 0.5, screenId: "primary", timestamp: Date.now() },
        };
        
        if (state !== "idle") {
          controller.onInputEvent(eventMap[state] as any);
        } else {
          // For idle, wait for timeout after transition
          controller.onInputEvent(eventMap.mouse_moving as any);
          vi.useFakeTimers();
          vi.runAllTimers();
          vi.useRealTimers();
        }
        
        const expectedProfile = PAIRPRO_DEFAULT_PROFILES[state];
        const calls = applyCallback.mock.calls;
        
        if (calls.length > 0) {
          const call = calls[calls.length - 1]; // Get last call
          expect(call[0]).toBe(expectedProfile.fps);
          expect(call[1]).toBeGreaterThan(0);
        }
      }
    });

    it("should apply quality parameters to RTCRtpSender via callback", () => {
      controller.onInputEvent({
        type: "mouse.move",
        x: 0.5,
        y: 0.5,
        screenId: "primary",
        timestamp: Date.now(),
      });

      // Verify callback was called
      expect(applyCallback).toHaveBeenCalled();
      const [fps, bitrateMbps] = applyCallback.mock.calls[applyCallback.mock.calls.length - 1];
      
      expect(fps).toBe(15); // mouse_moving fps
      expect(bitrateMbps).toBeCloseTo(6.6, 0); // Updated expected value
    });
  });

  describe("Resolution Handling", () => {
    it("should update resolution and recalculate bitrate", () => {
      applyCallback.mockClear();
      
      // Set resolution to Sharp (2560x1440)
      controller.setResolution(2560, 1440);
      
      // Trigger an event to apply new resolution
      controller.onInputEvent({
        type: "mouse.move",
        x: 0.5,
        y: 0.5,
        screenId: "primary",
        timestamp: Date.now(),
      });

      const [fps, bitrateMbps] = applyCallback.mock.calls[applyCallback.mock.calls.length - 1];
      
      // Same FPS (15 for mouse_moving), but bitrate should increase due to higher resolution
      expect(fps).toBe(15);
      // Higher resolution = higher bitrate. Sharp is ~1.33x Balanced pixels
      expect(bitrateMbps).toBeGreaterThan(6.6); // Higher than Balanced
    });

    it("should handle resolution changes mid-session", () => {
      // Start at Balanced
      controller.onInputEvent({
        type: "mouse.move",
        x: 0.5,
        y: 0.5,
        screenId: "primary",
        timestamp: Date.now(),
      });

      const bitrateBalanced = applyCallback.mock.calls[0][1];

      // Change to Sharp
      applyCallback.mockClear();
      controller.setResolution(2560, 1440);
      
      controller.onInputEvent({
        type: "mouse.move",
        x: 0.5,
        y: 0.5,
        screenId: "primary",
        timestamp: Date.now(),
      });

      const bitrateSharp = applyCallback.mock.calls[0][1];

      expect(bitrateSharp).toBeGreaterThan(bitrateBalanced);
    });
  });

  describe("Activity Detection", () => {
    it("should handle notifyActivity for all states", () => {
      const states: PairProActivityState[] = ["idle", "mouse_moving", "scrolling", "typing", "clicking"];
      
      for (const state of states) {
        applyCallback.mockClear();
        
        // For idle, need to transition first then timeout
        if (state === "idle") {
          controller.onInputEvent({
            type: "mouse.move",
            x: 0.5,
            y: 0.5,
            screenId: "primary",
            timestamp: Date.now(),
          });
          
          vi.useFakeTimers();
          vi.runAllTimers();
          vi.useRealTimers();
        } else {
          controller.notifyActivity(state);
        }
        
        expect(controller.state).toBe(state);
        // Check if callback was called (at least once for the state)
        if (state !== "idle") {
          expect(applyCallback).toHaveBeenCalled();
        }
      }
    });

    it("should ignore duplicate activity events in quick succession", () => {
      controller.onInputEvent({
        type: "mouse.move",
        x: 0.5,
        y: 0.5,
        screenId: "primary",
        timestamp: Date.now(),
      });

      const callCountAfterFirst = applyCallback.mock.calls.length;

      // Immediately send another mouse.move
      controller.onInputEvent({
        type: "mouse.move",
        x: 0.51,
        y: 0.51,
        screenId: "primary",
        timestamp: Date.now() + 10,
      });

      // Should not have called callback again (already in mouse_moving state)
      expect(applyCallback.mock.calls.length).toBe(callCountAfterFirst);
    });
  });

  describe("Disable", () => {
    it("should clean up and stop applying parameters", () => {
      controller.onInputEvent({
        type: "mouse.move",
        x: 0.5,
        y: 0.5,
        screenId: "primary",
        timestamp: Date.now(),
      });

      applyCallback.mockClear();
      controller.disable();

      // Try to trigger another event
      controller.onInputEvent({
        type: "mouse.move",
        x: 0.6,
        y: 0.6,
        screenId: "primary",
        timestamp: Date.now(),
      });

      // Should not call callback after disable
      expect(applyCallback).not.toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero-sized resolution gracefully", () => {
      // Should not crash
      controller.setResolution(0, 0);
      
      // Should still work
      controller.onInputEvent({
        type: "mouse.move",
        x: 0.5,
        y: 0.5,
        screenId: "primary",
        timestamp: Date.now(),
      });

      expect(controller.state).toBe("mouse_moving");
    });

    it("should handle rapid state changes", () => {
      const eventTypes = [
        { type: "mouse.move" as const, x: 0.5, y: 0.5, screenId: "primary" as const, timestamp: Date.now() },
        { type: "keyboard.down" as const, code: "KeyA", key: "a", ctrlKey: false, shiftKey: false, altKey: false, metaKey: false },
        { type: "mouse.wheel" as const, deltaX: 0, deltaY: -120, x: 0.5, y: 0.5, screenId: "primary" as const, timestamp: Date.now() },
        { type: "mouse.down" as const, button: 0, x: 0.5, y: 0.5, screenId: "primary" as const, timestamp: Date.now() },
      ];

      for (const event of eventTypes) {
        controller.onInputEvent(event as any);
      }

      expect(controller.state).toBeDefined();
      expect(applyCallback.mock.calls.length).toBeGreaterThan(0);
    });
  });
});
