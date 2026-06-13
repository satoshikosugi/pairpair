const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function getElectronPackageRoot() {
  const electronPackageJson = require.resolve("electron/package.json", {
    paths: [path.resolve(__dirname, "..")],
  });
  return path.dirname(electronPackageJson);
}

function getElectronExecutableRelativePath() {
  switch (process.platform) {
    case "win32":
      return path.join("dist", "electron.exe");
    case "darwin":
      return path.join("dist", "Electron.app", "Contents", "MacOS", "Electron");
    default:
      return path.join("dist", "electron");
  }
}

function isElectronInstalled(electronRoot) {
  const electronExecutable = path.join(
    electronRoot,
    getElectronExecutableRelativePath(),
  );
  const pathTxt = path.join(electronRoot, "path.txt");
  return fs.existsSync(electronExecutable) && fs.existsSync(pathTxt);
}

function installElectronBinary(electronRoot) {
  const installScript = path.join(electronRoot, "install.js");
  const result = spawnSync(process.execPath, [installScript], {
    cwd: electronRoot,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const electronRoot = getElectronPackageRoot();

if (!isElectronInstalled(electronRoot)) {
  console.log("[PairPair] Electron binary missing; running electron/install.js");
  installElectronBinary(electronRoot);
}
