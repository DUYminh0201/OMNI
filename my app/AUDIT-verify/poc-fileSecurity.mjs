// PoC: fileSecurity.js — resolveWithinDirectory
import path from 'node:path';
import os from 'node:os';
import { resolveWithinDirectory } from '../resources/mkt-flow/apps/marketing-flow-desktop/server/fileSecurity.js';

const ROOT = path.join(os.tmpdir(), 'audit-verify-root');
const cases = [
  ['normal.txt', 'normal file'],
  ['..\\..\\Windows\\System32\\drivers\\etc\\hosts', 'windows traversal'],
  ['../../etc/passwd', 'posix traversal'],
  ['..', 'parent dir'],
  ['.', 'single dot'],
  ['', 'empty string'],
  ['   ', 'spaces only'],
  ['C:\\Windows\\System32\\cmd.exe', 'absolute windows'],
  ['C:/Windows/System32/cmd.exe', 'absolute windows forward'],
  ['/etc/passwd', 'absolute posix'],
  ['\\\\?\\C:\\Windows\\System32\\cmd.exe', 'verbatim prefix'],
  ['\\\\server\\share\\evil.txt', 'UNC path'],
  ['\\\\.\\PhysicalDrive0', 'device namespace'],
  ['CON', 'reserved CON'],
  ['NUL', 'reserved NUL'],
  ['PRN', 'reserved PRN'],
  ['COM1.txt', 'reserved COM1'],
  ['AUX', 'reserved AUX'],
  ['LPT1', 'reserved LPT1'],
  ['a'.repeat(255), '255 chars'],
  ['a'.repeat(300), '300 chars'],
  ['a'.repeat(5000), '5000 chars'],
  ['nul\u0000.txt', 'embedded null'],
  ['...', 'three dots'],
  ['....', 'four dots'],
  ['..hidden', 'dotdot-prefixed name'],
  ['tệp-ảnh-của-tôi.png', 'unicode vietnamese'],
  ['日本語ファイル.txt', 'unicode japanese'],
  ['emoji😀.txt', 'emoji'],
  ['file.txt.', 'trailing dot'],
  ['file.txt ', 'trailing space'],
  ['sub/dir/file.txt', 'slash path'],
  ['sub\\dir\\file.txt', 'backslash path'],
  ['file.txt:stream', 'NTFS ADS'],
  ['a\u202Eb.txt', 'RTL override'],
  ['%2e%2e%2fetc%2fpasswd', 'url-encoded traversal'],
];

console.log(`ROOT = ${ROOT}`);
console.log('=== resolveWithinDirectory ===');
for (const [input, label] of cases) {
  let r;
  try {
    const out = resolveWithinDirectory(ROOT, input);
    const rel = path.relative(path.resolve(ROOT), out);
    const escape = rel.startsWith('..') || path.isAbsolute(rel);
    r = `RESOLVED ${JSON.stringify(out)}${escape ? '  <-- ESCAPED ROOT!' : ''}`;
  } catch (e) { r = 'THROW: ' + e.message; }
  const shown = input.length > 40 ? input.slice(0, 37) + '...' : input;
  console.log(`${JSON.stringify(shown).padEnd(44)} [${label.padEnd(24)}] -> ${r}`);
}

console.log('\n=== resolveWithinDirectory with non-string root/filename ===');
for (const [root, fn] of [[ROOT, undefined], [ROOT, null], [ROOT, 123], [ROOT, {}], [ROOT, []], [undefined, 'a.txt'], ['', 'a.txt']]) {
  let r;
  try { r = String(resolveWithinDirectory(root, fn)); } catch (e) { r = 'THROW: ' + e.message; }
  console.log(`root=${JSON.stringify(root)} fn=${JSON.stringify(fn)} -> ${r}`);
}

console.log('\n=== CRITICAL: does basename() normalize a trailing separator to ""? ===');
console.log('path.basename("a\\\\") =', JSON.stringify(path.basename('a\\')));
console.log('path.basename("a/")  =', JSON.stringify(path.basename('a/')));
console.log('resolution of ", " with root ending in separator handled by path.resolve');
