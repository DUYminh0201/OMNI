import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const AUDIO_MODES = new Set(['mute', 'keep_fx']);

export function normalizeAudioMode(audioMode = 'mute') {
  if (!AUDIO_MODES.has(audioMode)) {
    throw new Error(`Chế độ âm thanh không được hỗ trợ: ${audioMode}`);
  }
  return audioMode;
}

export function buildDubbedAudioFilters({ tempo, audioMode, accompanimentInput }) {
  const normalizedMode = normalizeAudioMode(audioMode);
  const filters = [
    {
      filter: 'atempo',
      options: Number(tempo).toFixed(2),
      inputs: '1:a',
      outputs: 'a_tempo',
    },
    {
      filter: 'highpass',
      options: 'f=80',
      inputs: 'a_tempo',
      outputs: 'a_hp',
    },
    {
      filter: 'volume',
      options: normalizedMode === 'keep_fx' ? '1.15' : '1.5',
      inputs: 'a_hp',
      outputs: 'a_fit',
    },
  ];

  if (normalizedMode === 'mute') {
    return { filters, audioMap: '[a_fit]' };
  }

  if (!accompanimentInput) {
    throw new Error('Thiếu stem nhạc và hiệu ứng đã loại giọng gốc.');
  }

  filters.push(
    {
      filter: 'volume',
      options: '2.0',
      inputs: accompanimentInput,
      outputs: 'fx_fit',
    },
    {
      filter: 'amix',
      options: 'inputs=2:duration=first:dropout_transition=0:weights=1 1:normalize=0',
      inputs: ['fx_fit', 'a_fit'],
      outputs: 'mixed_raw',
    },
    {
      filter: 'alimiter',
      options: 'limit=0.95:level=disabled',
      inputs: 'mixed_raw',
      outputs: 'a_mixed',
    },
  );

  return { filters, audioMap: '[a_mixed]' };
}

export function resolveDemucsRuntime({
  projectDir,
  resourcesDir = process.resourcesPath,
  env = process.env,
  platform = process.platform,
  existsSync = fs.existsSync,
} = {}) {
  const windows = platform === 'win32';
  const executableParts = windows
    ? ['runtime', 'python.exe']
    : ['runtime', 'bin', 'python'];
  const localParts = windows
    ? ['.audio-env', 'Scripts', 'python.exe']
    : ['.audio-env', 'bin', 'python'];

  if (env.DEMUCS_PYTHON && existsSync(env.DEMUCS_PYTHON)) {
    return { pythonPath: env.DEMUCS_PYTHON, processEnv: { ...env } };
  }

  const bundledRoot = env.DEMUCS_RUNTIME_DIR
    || (resourcesDir ? path.join(resourcesDir, 'audio-engine') : null);
  if (bundledRoot) {
    const bundledPython = path.join(bundledRoot, ...executableParts);
    if (existsSync(bundledPython)) {
      const sitePackages = path.join(bundledRoot, 'site-packages');
      const runtimeBin = windows
        ? path.join(bundledRoot, 'runtime')
        : path.join(bundledRoot, 'runtime', 'bin');
      const torchLib = path.join(sitePackages, 'torch', 'lib');

      return {
        pythonPath: bundledPython,
        processEnv: {
          ...env,
          PYTHONPATH: [sitePackages, env.PYTHONPATH].filter(Boolean).join(path.delimiter),
          HF_HOME: path.join(bundledRoot, 'huggingface'),
          HF_HUB_OFFLINE: '1',
          PATH: [runtimeBin, torchLib, env.PATH].filter(Boolean).join(path.delimiter),
        },
      };
    }
  }

  if (projectDir) {
    const localPython = path.join(projectDir, ...localParts);
    if (existsSync(localPython)) {
      return { pythonPath: localPython, processEnv: { ...env } };
    }
  }

  return null;
}

export function requireDemucsRuntime(options) {
  const runtime = resolveDemucsRuntime(options);
  if (!runtime) {
    throw new Error(
      'Audio Engine Demucs khÃ´ng cÃ³ trong báº£n cÃ i. Vui lÃ²ng cÃ i láº¡i Marketing Flow báº±ng bá»™ cÃ i Ä‘áº§y Ä‘á»§.',
    );
  }
  return runtime;
}

export async function verifyDemucsRuntime({ pythonPath, processEnv }) {
  try {
    await runProcess(pythonPath, [
      '-c',
      "import demucs, torch; from demucs.pretrained import get_model; get_model('htdemucs')",
    ], processEnv);
  } catch (error) {
    throw new Error(`Audio Engine Demucs khÃ´ng thá»ƒ khá»Ÿi Ä‘á»™ng: ${error.message}`, { cause: error });
  }
}

export function buildDemucsSeparationPlan({ inputPath, outputDir }) {
  const modelName = 'htdemucs';
  const trackName = path.basename(inputPath, path.extname(inputPath));

  return {
    args: [
      '-m',
      'demucs',
      '--two-stems=vocals',
      '--other-method=minus',
      '--float32',
      '--clip-mode=none',
      '--name',
      modelName,
      '--out',
      outputDir,
      inputPath,
    ],
    stemPath: path.join(outputDir, modelName, trackName, 'minus_vocals.wav'),
  };
}

function runProcess(command, args, processEnv = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, env: processEnv });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-12000);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Demucs kết thúc với mã lỗi ${code}.`));
    });
  });
}

export async function separateNoVocalsStem({ inputPath, outputDir, pythonPath, processEnv }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const separationPlan = buildDemucsSeparationPlan({ inputPath, outputDir });

  try {
    await runProcess(pythonPath, separationPlan.args, processEnv);
  } catch (error) {
    const missingModule = /No module named demucs/i.test(error.message);
    const detail = missingModule
      ? 'Chưa cài bộ tách stem Demucs. Hãy chạy npm run setup:audio một lần rồi thử lại.'
      : `Không thể tách giọng gốc bằng Demucs: ${error.message}`;
    throw new Error(detail, { cause: error });
  }

  const stemPath = separationPlan.stemPath;
  if (!fs.existsSync(stemPath)) {
    throw new Error('Demucs đã chạy nhưng không tạo được stem minus_vocals.wav.');
  }

  return stemPath;
}
