import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const projectDir = path.resolve(import.meta.dirname, '..');
const environmentDir = path.join(projectDir, '.audio-env');
const basePython = process.env.DEMUCS_SETUP_PYTHON || 'python';
const environmentPython = process.platform === 'win32'
  ? path.join(environmentDir, 'Scripts', 'python.exe')
  : path.join(environmentDir, 'bin', 'python');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectDir,
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!fs.existsSync(environmentPython)) {
  console.log('Đang tạo môi trường Python riêng cho bộ tách giọng...');
  run(basePython, ['-m', 'venv', environmentDir]);
}

console.log('Đang cài Demucs và mô hình tách stem...');
run(environmentPython, ['-m', 'pip', 'install', '--upgrade', 'pip']);
run(environmentPython, ['-m', 'pip', 'install', 'demucs', 'numpy']);
run(environmentPython, [
  '-c',
  "from demucs.pretrained import get_model; get_model('htdemucs'); print('htdemucs model ready')",
]);
console.log('Hoàn tất. Chế độ giữ nhạc và hiệu ứng đã sẵn sàng.');
