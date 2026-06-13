export interface GuestToolboxState {
  enabled: boolean;
  color: string;
  width: number;
  displayMode: "fit" | "native";
  wheelDirection: "standard" | "natural";
  canUndo: boolean;
  hasStrokes: boolean;
}

export type GuestToolboxAction =
  | { type: "toggle-marker" }
  | { type: "set-display-mode"; mode: "fit" | "native" }
  | { type: "toggle-wheel-direction" }
  | { type: "set-color"; color: string }
  | { type: "set-width"; width: number }
  | { type: "undo" }
  | { type: "clear" }
  | { type: "toggle-fullscreen" };
