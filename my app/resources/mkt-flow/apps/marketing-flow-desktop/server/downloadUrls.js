export function buildFreshDownloadUrl(filename, version = Date.now()) {
  return `/downloads/${encodeURIComponent(filename)}?v=${version}`;
}
