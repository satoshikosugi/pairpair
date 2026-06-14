const ANONYMOUS_NAME = "無名";

export function normalizeNickname(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : ANONYMOUS_NAME;
}

export function sanitizeNicknameInput(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 30);
}
