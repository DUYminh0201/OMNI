import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const projectDir = path.resolve(import.meta.dirname, '..');
const bundleDir = path.join(projectDir, '.audio-bundle');
const sourcePython = path.join(
  projectDir,
  '.audio-env',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);

function fail(message) {
  console.error(`[Audio Bundle] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectDir,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || `Exit code ${result.status}`);
  }
  return result.stdout.trim();
}

function copyDirectory(source, destination) {
  fs.cpSync(source, destination, {
    recursive: true,
    dereference: true,
    filter: (entry) => {
      const name = path.basename(entry);
      return name !== '__pycache__' && !name.endsWith('.pyc');
    },
  });
}

function directorySize(directory) {
  let total = 0;
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) total += fs.statSync(target).size;
    }
  }
  return total;
}

if (process.platform !== 'win32') {
  fail('Hiá»‡n chá»‰ há»— trá»£ táº¡o audio engine cho bá»™ cÃ i Windows.');
}

if (!fs.existsSync(sourcePython)) {
  fail('ChÆ°a cÃ³ .audio-env. HÃ£y cháº¡y npm run setup:audio trÆ°á»›c khi Ä‘Ã³ng gÃ³i.');
}

let sourceInfo;
try {
  sourceInfo = JSON.parse(run(sourcePython, [
    '-c',
    [
      'import demucs, json, pathlib, sys',
      'from huggingface_hub import constants',
      "model = pathlib.Path(constants.HF_HUB_CACHE) / 'models--adefossez--HTDemucs'",
      'site_packages = pathlib.Path(demucs.__file__).parent.parent',
      "print(json.dumps({'baseRuntime': sys.base_prefix, 'sitePackages': str(site_packages), 'modelCache': str(model), 'pythonVersion': sys.version.split()[0]}))",
    ].join('; '),
  ]));
} catch (error) {
  fail(`KhÃ´ng thá»ƒ Ä‘á»c thÃ´ng tin Demucs: ${error.message}`);
}

for (const [label, target] of Object.entries({
  'Python runtime': sourceInfo.baseRuntime,
  'Demucs site-packages': sourceInfo.sitePackages,
  'HTDemucs model cache': sourceInfo.modelCache,
})) {
  if (!fs.existsSync(target)) fail(`Thiáº¿u ${label}: ${target}`);
}

const manifestPath = path.join(bundleDir, 'manifest.json');
const desiredManifest = {
  schemaVersion: 1,
  pythonVersion: sourceInfo.pythonVersion,
  sourceRuntime: sourceInfo.baseRuntime,
  sourceSitePackages: sourceInfo.sitePackages,
  sourceModelCache: sourceInfo.modelCache,
};
let currentManifest;
try {
  currentManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch {
  currentManifest = null;
}

const requiredFiles = [
  path.join(bundleDir, 'runtime', 'python.exe'),
  path.join(bundleDir, 'site-packages', 'demucs', '__init__.py'),
  path.join(bundleDir, 'site-packages', 'torch', '__init__.py'),
  path.join(bundleDir, 'huggingface', 'hub', 'models--adefossez--HTDemucs'),
];
const bundleCurrent = currentManifest
  && Object.entries(desiredManifest).every(([key, value]) => currentManifest[key] === value)
  && requiredFiles.every((target) => fs.existsSync(target));

if (!bundleCurrent) {
  if (path.dirname(bundleDir) !== projectDir || path.basename(bundleDir) !== '.audio-bundle') {
    fail(`Unsafe audio bundle removal target: ${bundleDir}`);
  }

  console.log('[Audio Bundle] Äang táº¡o Python runtime tá»± chá»©a...');
  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.mkdirSync(bundleDir, { recursive: true });
  copyDirectory(sourceInfo.baseRuntime, path.join(bundleDir, 'runtime'));

  console.log('[Audio Bundle] Äang sao chÃ©p Demucs vÃ  PyTorch...');
  copyDirectory(sourceInfo.sitePackages, path.join(bundleDir, 'site-packages'));

  console.log('[Audio Bundle] Äang sao chÃ©p model HTDemucs...');
  copyDirectory(
    sourceInfo.modelCache,
    path.join(bundleDir, 'huggingface', 'hub', 'models--adefossez--HTDemucs'),
  );
  fs.writeFileSync(manifestPath, `${JSON.stringify(desiredManifest, null, 2)}\n`, 'utf8');
} else {
  console.log('[Audio Bundle] Bundle hiá»‡n táº¡i Ä‘Ã£ Ä‘áº§y Ä‘á»§, bá» qua sao chÃ©p.');
}

const bundledPython = path.join(bundleDir, 'runtime', 'python.exe');
const bundledSitePackages = path.join(bundleDir, 'site-packages');
const validationEnv = {
  ...process.env,
  PYTHONPATH: bundledSitePackages,
  HF_HOME: path.join(bundleDir, 'huggingface'),
  HF_HUB_OFFLINE: '1',
  PATH: [
    path.join(bundleDir, 'runtime'),
    path.join(bundledSitePackages, 'torch', 'lib'),
    process.env.PATH,
  ].filter(Boolean).join(path.delimiter),
};

try {
  run(bundledPython, [
    '-c',
    "import demucs, torch; from demucs.pretrained import get_model; get_model('htdemucs'); print('ready')",
  ], { env: validationEnv });
} catch (error) {
  fail(`Bundle khÃ´ng thá»ƒ khá»Ÿi Ä‘á»™ng offline: ${error.message}`);
}

const sizeGiB = (directorySize(bundleDir) / (1024 ** 3)).toFixed(2);
console.log(`[Audio Bundle] Ready (${sizeGiB} GiB): ${bundleDir}`);
