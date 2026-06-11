export interface MouseMoveEvent {
  type: "mouse.move";
  x: number;
  y: number;
  screenId: string;
  timestamp: number;
}

export interface MouseDownEvent {
  type: "mouse.down";
  button: "left" | "right" | "middle";
  x: number;
  y: number;
}

export interface MouseUpEvent {
  type: "mouse.up";
  button: "left" | "right" | "middle";
  x: number;
  y: number;
}

export interface MouseWheelEvent {
  type: "mouse.wheel";
  deltaX: number;
  deltaY: number;
  x: number;
  y: number;
}

export interface KeyboardDownEvent {
  type: "keyboard.down";
  code: string;
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export interface KeyboardUpEvent {
  type: "keyboard.up";
  code: string;
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export interface TextInputEvent {
  type: "text.input";
  text: string;
}

export type InputEvent =
  | MouseMoveEvent
  | MouseDownEvent
  | MouseUpEvent
  | MouseWheelEvent
  | KeyboardDownEvent
  | KeyboardUpEvent
  | TextInputEvent;
