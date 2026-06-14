import { execFile } from "node:child_process";
import { promisify } from "node:util";
import log from "electron-log";

const execFileAsync = promisify(execFile);

export type MacInputSourceMode = "japanese" | "latin" | null;

export function parseMacInputSourceMode(output: string): MacInputSourceMode {
  const normalized = output.toLowerCase();

  if (normalized.includes("com.apple.inputmethod.japanese")) {
    return "japanese";
  }

  if (
    normalized.includes("com.apple.keylayout.abc")
    || normalized.includes('"keyboardlayout name" = abc;')
    || normalized.includes('"keyboardlayout name" = "abc";')
    || normalized.includes("inputsourcekind = \"keyboard layout\"")
  ) {
    return "latin";
  }

  return null;
}

export async function getCurrentMacInputSourceMode(): Promise<MacInputSourceMode> {
  if (process.platform !== "darwin") {
    return null;
  }

  try {
    const { stdout } = await execFileAsync("defaults", ["read", "com.apple.HIToolbox", "AppleSelectedInputSources"], {
      timeout: 1500,
      windowsHide: true,
    });
    return parseMacInputSourceMode(stdout);
  } catch (error) {
    log.warn({ error }, "Failed to read current macOS input source");
    return null;
  }
}
