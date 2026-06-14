export interface AnnotationPoint {
  x: number;
  y: number;
}

export interface AnnotationStroke {
  id: string;
  color: string;
  width: number;
  points: AnnotationPoint[];
  createdAt: number;
}

export interface GuestCursorIndicator {
  x: number;
  y: number;
  visible: boolean;
  timestamp: number;
}

export type HostCursorKind =
  | "default"
  | "text"
  | "crosshair"
  | "pointer"
  | "move"
  | "wait"
  | "progress"
  | "help"
  | "not-allowed"
  | "ew-resize"
  | "ns-resize"
  | "nwse-resize"
  | "nesw-resize";

export interface HostCursorIndicator {
  x: number;
  y: number;
  visible: boolean;
  timestamp: number;
  kind: HostCursorKind;
}

export interface SpotlightIndicator {
  x: number;
  y: number;
  label?: string;
  visible: boolean;
  timestamp: number;
}

export interface HostOverlayState {
  strokes: AnnotationStroke[];
  guestCursor: GuestCursorIndicator | null;
  spotlight: SpotlightIndicator | null;
}
