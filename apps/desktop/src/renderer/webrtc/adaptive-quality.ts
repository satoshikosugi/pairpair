import type { InputEvent, PairProActivityState, PairProProfile } from "@pairpair/shared";
import { calcBitrateMbps } from "@pairpair/shared";

type ApplyCallback = (fps: number, bitrateMbps: number) => void;

const STATE_PRIORITY: Record<PairProActivityState, number> = {
  idle: 0,
  typing: 1,
  mouse_moving: 2,
  scrolling: 3,
  clicking: 4,
};

function inputEventToState(event: InputEvent): PairProActivityState | null {
  switch (event.type) {
    case "mouse.move":  return "mouse_moving";
    case "mouse.wheel": return "scrolling";
    case "mouse.down":
    case "mouse.up":    return "clicking";
    case "keyboard.down":
    case "keyboard.up":
    case "text.input":  return "typing";
    default:            return null;
  }
}

export class AdaptiveQualityController {
  private _enabled = false;
  private _state: PairProActivityState = "idle";
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private profiles: Record<PairProActivityState, PairProProfile> | null = null;
  private onApply: ApplyCallback | null = null;
  private resWidth = 1920;
  private resHeight = 1080;

  get enabled(): boolean {
    return this._enabled;
  }

  get state(): PairProActivityState {
    return this._state;
  }

  enable(
    profiles: Record<PairProActivityState, PairProProfile>,
    onApply: ApplyCallback,
    resWidth = 1920,
    resHeight = 1080,
  ): void {
    this.profiles = profiles;
    this.onApply = onApply;
    this.resWidth = resWidth;
    this.resHeight = resHeight;
    this._enabled = true;
    this._state = "idle";
    this.applyCurrentState();
  }

  /** Update resolution reference for bitrate calculation (call after live resolution change). */
  setResolution(width: number, height: number): void {
    this.resWidth = width;
    this.resHeight = height;
    if (this._enabled) this.applyCurrentState();
  }

  disable(): void {
    this._enabled = false;
    this.clearIdleTimer();
    this.profiles = null;
    this.onApply = null;
    this._state = "idle";
  }

  onInputEvent(event: InputEvent): void {
    if (!this._enabled || !this.profiles) return;

    const newState = inputEventToState(event);
    if (!newState) return;

    // Transition to higher-priority state immediately
    if (
      newState !== this._state &&
      STATE_PRIORITY[newState] >= STATE_PRIORITY[this._state]
    ) {
      this._state = newState;
      this.applyCurrentState();
    }

    // Always use the CURRENT state's timeout (after possible transition above)
    this.scheduleIdle(this.profiles[this._state].idleTimeoutMs);
  }

  // For host-side native events (mousemove, keydown, etc.)
  notifyActivity(state: PairProActivityState): void {
    if (!this._enabled || !this.profiles) return;
    if (state !== this._state && STATE_PRIORITY[state] >= STATE_PRIORITY[this._state]) {
      this._state = state;
      this.applyCurrentState();
    }
    this.scheduleIdle(this.profiles[this._state].idleTimeoutMs);
  }

  private applyCurrentState(): void {
    if (!this.profiles || !this.onApply) return;
    const p = this.profiles[this._state];
    const bitrateMbps = calcBitrateMbps(p.quality, this.resWidth, this.resHeight, p.fps);
    this.onApply(p.fps, bitrateMbps);
  }

  private scheduleIdle(delayMs: number): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this._state = "idle";
      this.applyCurrentState();
      this.idleTimer = null;
    }, delayMs);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}

export const adaptiveQualityController = new AdaptiveQualityController();
