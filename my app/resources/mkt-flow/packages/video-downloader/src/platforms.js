const PLATFORM_HOSTS = [
  { platform: 'tiktok', domains: ['tiktok.com'] },
  { platform: 'douyin', domains: ['douyin.com'] },
  { platform: 'youtube', domains: ['youtube.com', 'youtu.be'] },
];

function matchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function detectVideoPlatform(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') return null;
    const normalizedHostname = parsed.hostname.toLowerCase();
    return PLATFORM_HOSTS.find(({ domains }) => (
      domains.some((domain) => matchesDomain(normalizedHostname, domain))
    ))?.platform ?? null;
  } catch {
    return null;
  }
}

export function isSupportedVideoUrl(value) {
  return detectVideoPlatform(value) !== null;
}
