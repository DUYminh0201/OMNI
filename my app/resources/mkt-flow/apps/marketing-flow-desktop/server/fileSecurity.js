import path from 'node:path';

export function resolveWithinDirectory(rootDirectory, filename) {
  if (typeof filename !== 'string' || !filename || filename === '.') {
    throw new Error('Invalid filename');
  }

  if (filename !== path.basename(filename) || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Invalid filename');
  }

  const root = path.resolve(rootDirectory);
  const resolved = path.resolve(root, filename);
  const relative = path.relative(root, resolved);

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid filename');
  }

  return resolved;
}
