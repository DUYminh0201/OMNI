const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const appRoot = path.join(__dirname, "..");
const runtimeExe = path.join(appRoot, "..", "runtime", "Omnira Studio.exe");
const extraArgs = process.argv.slice(2);

let electronBin = null;
if (fs.existsSync(runtimeExe)) {
  electronBin = runtimeExe;
} else {
  try {
    electronBin = require("electron");
  } catch {
    electronBin = null;
  }
}

if (electronBin && typeof electronBin === "string") {
  const args = electronBin === runtimeExe ? extraArgs : [".", ...extraArgs];
  const child = spawn(electronBin, args, {
    cwd: appRoot,
    env,
    stdio: "inherit"
  });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  const child = spawn(process.execPath, [path.join(appRoot, "out/main/index.js"), "--open-http", ...extraArgs], {
    cwd: appRoot,
    env,
    stdio: "inherit"
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}
