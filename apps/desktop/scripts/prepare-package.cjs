const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..", "..");
const packageRoot = path.join(repoRoot, "packages");
const stageRoot = path.join(desktopRoot, ".stage");
const appStageRoot = path.join(stageRoot, "app");
const deployTempRoot = path.join("C:\\tmp", "pairpair-deploy-app");
const releaseDistRoot = path.join(desktopRoot, "release-dist");
const cliArgs = process.argv.slice(2);

function getCliOption(name) {
  const prefix = `--${name}=`;
  const entry = cliArgs.find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
}

const targetPlatform = getCliOption("platform");
const targetArch = getCliOption("arch");
const nativeTarget = getCliOption("native-target");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runPnpm(args, options = {}) {
  const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  run(pnpmCommand, args, {
    shell: process.platform === "win32",
    ...options,
  });
}

function runAllowFailure(command, args, options = {}) {
  spawnSync(command, args, {
    cwd: desktopRoot,
    stdio: "ignore",
    shell: false,
    ...options,
  });
}

function sleep(milliseconds) {
  if (process.platform === "win32") {
    runAllowFailure("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Start-Sleep -Milliseconds ${milliseconds}`,
    ]);
    return;
  }

  runAllowFailure("node", ["-e", `setTimeout(() => {}, ${milliseconds})`]);
}

function ensureElectronInstalled() {
  run(process.execPath, [path.join(desktopRoot, "scripts", "ensure-electron-install.cjs")]);
}

function cleanupWindowsPackagingOutput() {
  if (process.platform !== "win32") {
    return;
  }

  const releaseWinUnpacked = path.join(releaseDistRoot, "win-unpacked").replace(/\\/g, "\\\\");
  const legacyWinUnpacked = path.join(desktopRoot, "dist", "win-unpacked").replace(/\\/g, "\\\\");
  const command = [
    "$targets = @(",
    `'${releaseWinUnpacked}'`,
    `'${legacyWinUnpacked}'`,
    ")",
    "$processes = Get-CimInstance Win32_Process -Filter \"name = 'PairPair.exe'\" -ErrorAction SilentlyContinue",
    "foreach ($proc in $processes) {",
    "  $exePath = $proc.ExecutablePath",
    "  if (-not $exePath) { continue }",
    "  foreach ($target in $targets) {",
    "    if ($exePath.StartsWith($target, [System.StringComparison]::OrdinalIgnoreCase)) {",
    "      Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue",
    "      break",
    "    }",
    "  }",
    "}",
  ].join("; ");

  run("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    command,
  ]);

  runAllowFailure("taskkill", ["/F", "/T", "/IM", "PairPair.exe"], {
    shell: process.platform === "win32",
  });
  sleep(500);
}

function buildWorkspacePackages() {
  if (nativeTarget) {
    runPnpm([
      "--dir",
      path.join(packageRoot, "native-input"),
      "exec",
      "napi",
      "build",
      "--platform",
      "--release",
      "--target",
      nativeTarget,
    ]);
  } else {
    runPnpm(["--dir", path.join(packageRoot, "native-input"), "build:native:release"]);
  }
  runPnpm(["--dir", path.join(packageRoot, "native-input"), "build"]);
  runPnpm(["--dir", path.join(packageRoot, "shared"), "build"]);
}

function buildDesktop() {
  runPnpm(["build"]);
}

function safeReset(targetPath) {
  const allowedRoots = [stageRoot, releaseDistRoot, "C:\\tmp"];
  if (!allowedRoots.some((root) => targetPath.startsWith(root))) {
    throw new Error(`Refusing to delete outside stage root: ${targetPath}`);
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function deployDesktopApp() {
  ensureDir(stageRoot);
  safeReset(appStageRoot);
  safeReset(deployTempRoot);
  runPnpm([
    "--dir",
    repoRoot,
    "--filter",
    "@pairpair/desktop",
    "--prod",
    "deploy",
    "--legacy",
    deployTempRoot,
  ]);
  fs.renameSync(deployTempRoot, appStageRoot);
}

function removePath(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function pruneDesktopStage() {
  const rootKeep = new Set([
    "package.json",
    "out",
    "node_modules",
  ]);

  for (const entry of fs.readdirSync(appStageRoot, { withFileTypes: true })) {
    if (rootKeep.has(entry.name)) {
      continue;
    }
    removePath(path.join(appStageRoot, entry.name));
  }

  const nativeInputRoot = path.join(appStageRoot, "node_modules", "@pairpair", "native-input");
  if (fs.existsSync(nativeInputRoot)) {
    for (const entry of fs.readdirSync(nativeInputRoot, { withFileTypes: true })) {
      const keep =
        entry.name === "index.js" ||
        entry.name === "index.d.ts" ||
        entry.name === "package.json" ||
        entry.name === "dist" ||
        entry.name.endsWith(".node");

      if (!keep) {
        removePath(path.join(nativeInputRoot, entry.name));
      }
    }
  }

  const sharedRoot = path.join(appStageRoot, "node_modules", "@pairpair", "shared");
  if (fs.existsSync(sharedRoot)) {
    for (const entry of fs.readdirSync(sharedRoot, { withFileTypes: true })) {
      const keep =
        entry.name === "package.json" ||
        entry.name === "dist";

      if (!keep) {
        removePath(path.join(sharedRoot, entry.name));
      }
    }
  }
}

function main() {
  if ((targetPlatform && !targetArch) || (!targetPlatform && targetArch)) {
    throw new Error("Both --platform and --arch must be provided together.");
  }

  ensureElectronInstalled();
  cleanupWindowsPackagingOutput();
  buildWorkspacePackages();
  buildDesktop();
  deployDesktopApp();
  pruneDesktopStage();
}

main();
