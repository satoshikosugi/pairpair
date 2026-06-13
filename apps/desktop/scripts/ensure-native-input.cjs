const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const packageRoot = path.resolve(__dirname, "../../../packages/native-input");

function getBinaryName() {
  if (process.platform === "win32") {
    if (process.arch === "x64") return "index.win32-x64-msvc.node";
    if (process.arch === "ia32") return "index.win32-ia32-msvc.node";
    if (process.arch === "arm64") return "index.win32-arm64-msvc.node";
  }

  if (process.platform === "darwin") {
    if (process.arch === "x64") return "index.darwin-x64.node";
    if (process.arch === "arm64") return "index.darwin-arm64.node";
  }

  return null;
}

function runPnpm(scriptName) {
  const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  return spawnSync(
    pnpmCommand,
    ["--dir", packageRoot, scriptName],
    { stdio: "inherit", shell: true },
  );
}

function runPnpmOrExit(scriptName) {
  const result = runPnpm(scriptName);
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function getNewestMtimeMs(targetPath) {
  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    return stat.mtimeMs;
  }

  let newest = stat.mtimeMs;
  for (const entry of fs.readdirSync(targetPath)) {
    newest = Math.max(newest, getNewestMtimeMs(path.join(targetPath, entry)));
  }
  return newest;
}

const binaryName = getBinaryName();

if (binaryName) {
  const binaryPath = path.join(packageRoot, binaryName);
  const rustInputs = [
    path.join(packageRoot, "Cargo.toml"),
    path.join(packageRoot, "build.rs"),
    path.join(packageRoot, "src"),
  ];
  const newestRustInput = Math.max(...rustInputs.map((targetPath) => getNewestMtimeMs(targetPath)));
  const hasBinary = fs.existsSync(binaryPath);
  const binaryMtime = hasBinary ? fs.statSync(binaryPath).mtimeMs : 0;
  const needsNativeBuild = !hasBinary || newestRustInput > binaryMtime;

  if (needsNativeBuild) {
    console.log(`[PairPair] Native input binary ${hasBinary ? "stale" : "missing"}; building ${binaryName}`);
    const result = runPnpm("build:native");
    if (result.status !== 0) {
      if (!hasBinary) {
        process.exit(result.status ?? 1);
      }
      console.warn("[PairPair] Native input rebuild failed; continuing with existing binary");
    }
  }
}

runPnpmOrExit("build");
