const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const desktopRoot = path.resolve(__dirname, "..");
const releaseRoot = path.join(desktopRoot, "release-dist");
const buildsRoot = path.join(releaseRoot, "builds");

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

function runPnpm(args) {
  const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  run(pnpmCommand, args, { shell: process.platform === "win32" });
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function copyFileIfExists(sourcePath, destinationPath) {
  if (!fs.existsSync(sourcePath)) {
    return;
  }
  fs.copyFileSync(sourcePath, destinationPath);
}

function createBuildOutputDir() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(buildsRoot, `win-${timestamp}`);
  ensureDir(outputDir);
  return outputDir;
}

function main() {
  const outputDir = createBuildOutputDir();

  run(process.execPath, [
    path.join(desktopRoot, "scripts", "prepare-package.cjs"),
    "--platform=win32",
    "--arch=x64",
  ]);

  runPnpm([
    "exec",
    "electron-builder",
    "--config",
    "electron-builder.yml",
    "--win",
    "nsis",
    "--publish=never",
    `-c.directories.output=${outputDir}`,
  ]);

  ensureDir(releaseRoot);

  const setupExe = path.join(outputDir, "PairPair Setup 0.1.0.exe");
  const setupBlockmap = `${setupExe}.blockmap`;

  copyFileIfExists(setupExe, path.join(releaseRoot, path.basename(setupExe)));
  copyFileIfExists(setupBlockmap, path.join(releaseRoot, path.basename(setupBlockmap)));
}

main();
