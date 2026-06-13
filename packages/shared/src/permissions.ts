import type { InputEvent } from "./input-events";

export type PermissionPresetId =
  | "viewOnly"
  | "pointerOnly"
  | "pointerAndClick"
  | "clipboardOnly"
  | "noKeyboard"
  | "annotationOnly"
  | "fullControl";

export interface SessionPermissions {
  mouseMove: boolean;
  mouseClick: boolean;
  mouseWheel: boolean;
  keyboard: boolean;
  clipboard: boolean;
  annotation: boolean;
}

export interface PermissionPreset {
  id: PermissionPresetId;
  label: string;
  summary: string;
  permissions: SessionPermissions;
}

export const PERMISSION_PRESETS: Record<PermissionPresetId, PermissionPreset> = {
  viewOnly: {
    id: "viewOnly",
    label: "閲覧のみ",
    summary: "入力も注釈も許可しません",
    permissions: { mouseMove: false, mouseClick: false, mouseWheel: false, keyboard: false, clipboard: false, annotation: false },
  },
  pointerOnly: {
    id: "pointerOnly",
    label: "ポインタのみ",
    summary: "マウス移動だけを許可します",
    permissions: { mouseMove: true, mouseClick: false, mouseWheel: false, keyboard: false, clipboard: false, annotation: false },
  },
  pointerAndClick: {
    id: "pointerAndClick",
    label: "ポインタ + クリック",
    summary: "マウス移動とクリックを許可します",
    permissions: { mouseMove: true, mouseClick: true, mouseWheel: false, keyboard: false, clipboard: false, annotation: false },
  },
  clipboardOnly: {
    id: "clipboardOnly",
    label: "クリップボードのみ",
    summary: "テキスト貼り付けだけを許可します",
    permissions: { mouseMove: false, mouseClick: false, mouseWheel: false, keyboard: false, clipboard: true, annotation: false },
  },
  noKeyboard: {
    id: "noKeyboard",
    label: "キーボード禁止",
    summary: "ポインタ操作と注釈を許可し、キーボード入力は遮断します",
    permissions: { mouseMove: true, mouseClick: true, mouseWheel: true, keyboard: false, clipboard: false, annotation: true },
  },
  annotationOnly: {
    id: "annotationOnly",
    label: "注釈のみ",
    summary: "マーカー注釈だけを許可します",
    permissions: { mouseMove: false, mouseClick: false, mouseWheel: false, keyboard: false, clipboard: false, annotation: true },
  },
  fullControl: {
    id: "fullControl",
    label: "フルコントロール",
    summary: "マウス、ホイール、キーボード、注釈を許可します",
    permissions: { mouseMove: true, mouseClick: true, mouseWheel: true, keyboard: true, clipboard: false, annotation: true },
  },
};

export function getPermissionPreset(id: PermissionPresetId): PermissionPreset {
  return PERMISSION_PRESETS[id];
}

export function isInputEventAllowed(event: InputEvent, permissions: SessionPermissions): boolean {
  switch (event.type) {
    case "mouse.move":
      return permissions.mouseMove;
    case "mouse.down":
    case "mouse.up":
      return permissions.mouseClick;
    case "mouse.wheel":
      return permissions.mouseWheel;
    case "keyboard.down":
    case "keyboard.up":
    case "ime.mode":
      return permissions.keyboard;
    case "text.input":
      return permissions.clipboard;
  }
}

export function hasInteractiveControl(permissions: SessionPermissions): boolean {
  return permissions.mouseMove || permissions.mouseClick || permissions.mouseWheel || permissions.keyboard;
}
