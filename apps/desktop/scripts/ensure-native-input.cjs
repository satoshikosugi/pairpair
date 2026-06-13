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
  const result = spawnSync(
    "npx",
    ["pnpm@9", "--dir", packageRoot, scriptName],
    { stdio: "inherit", shell: true },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const binaryName = getBinaryName();

if (binaryName) {
  const binaryPath = path.join(packageRoot, binaryName);
  if (!fs.existsSync(binaryPath)) {
    console.log(`[PairPair] Native input binary missing; building ${binaryName}`);
    runPnpm("build:native");
  }
}

runPnpm("build");
