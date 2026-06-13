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
