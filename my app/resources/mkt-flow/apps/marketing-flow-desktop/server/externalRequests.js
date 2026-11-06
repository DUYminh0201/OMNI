import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const responseCleanup = new WeakMap();

export function releaseExternalResponse(response) {
  const cleanup = responseCleanup.get(response);
  if (!cleanup) return;
  responseCleanup.delete(response);
  cleanup();
}

function isPrivateIpv4(address) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

export function isPrivateIpAddress(address) {
  const normalized = String(address || '').trim().toLowerCase();
  const version = net.isIP(normalized);

  if (version === 4) return isPrivateIpv4(normalized);
  if (version !== 6) return true;

  if (normalized.startsWith('::ffff:')) {
    const mappedIpv4 = normalized.slice('::ffff:'.length);
    return net.isIP(mappedIpv4) === 4 ? isPrivateIpv4(mappedIpv4) : true;
  }

  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/u.test(normalized);
}

export async function assertSafeExternalUrl(rawUrl, { lookup = dns.lookup } = {}) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid external URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('External URL protocol is not allowed');
  }
  if (parsed.username || parsed.password) {
    throw new Error('External URL credentials are not allowed');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('External URL host is not allowed');
  }

  if (net.isIP(hostname)) {
    if (isPrivateIpAddress(hostname)) throw new Error('External URL resolves to a private address');
    return parsed;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  const records = Array.isArray(addresses) ? addresses : [addresses];
  if (records.length === 0 || records.some(({ address }) => isPrivateIpAddress(address))) {
    throw new Error('External URL resolves to a private address');
  }

  return parsed;
}

export async function fetchExternalWithTimeout(
  rawUrl,
  options = {},
  timeoutMs = 8000,
  { fetchImpl = globalThis.fetch, lookup = dns.lookup, maxRedirects = 5 } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let returnedResponse = null;

  try {
    let currentUrl = await assertSafeExternalUrl(rawUrl, { lookup });
    let requestOptions = { ...options };

    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const response = await fetchImpl(currentUrl, {
        ...requestOptions,
        redirect: 'manual',
        signal: controller.signal,
      });

      if (!REDIRECT_STATUSES.has(response.status)) {
        returnedResponse = response;
        responseCleanup.set(response, () => clearTimeout(timer));
        return response;
      }

      const location = response.headers.get('location');
      await response.body?.cancel?.();
      if (!location) throw new Error('External redirect is missing a location');
      if (redirectCount === maxRedirects) throw new Error('Too many external redirects');

      currentUrl = await assertSafeExternalUrl(new URL(location, currentUrl).toString(), { lookup });
      if (response.status === 303) {
        requestOptions = { ...requestOptions, method: 'GET', body: undefined };
      }
    }

    throw new Error('Too many external redirects');
  } finally {
    if (!returnedResponse) clearTimeout(timer);
  }
}

export async function readResponseText(response, maxBytes = 2 * 1024 * 1024) {
  try {
    const contentLength = Number.parseInt(response.headers.get('content-length') || '', 10);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error('External response is too large');
    }

    if (!response.body?.getReader) {
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('External response is too large');
      return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let totalBytes = 0;
    let text = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error('External response is too large');
      }
      text += decoder.decode(value, { stream: true });
    }

    return text + decoder.decode();
  } finally {
    releaseExternalResponse(response);
  }
}

export async function pipeExternalResponse(response, writable, maxBytes = 512 * 1024 * 1024) {
  let reader;
  let completed = false;
  try {
    const contentLength = Number.parseInt(response.headers.get('content-length') || '', 10);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      await response.body?.cancel?.();
      throw new Error('External response is too large');
    }
    if (!response.body?.getReader) throw new Error('External response body is not streamable');

    reader = response.body.getReader();
    let totalBytes = 0;
    while (!writable.destroyed) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error('External response is too large');
      }
      if (!writable.write(Buffer.from(value))) {
        await new Promise((resolve) => {
          const finishWait = () => {
            writable.off('drain', finishWait);
            writable.off('close', finishWait);
            resolve();
          };
          writable.once('drain', finishWait);
          writable.once('close', finishWait);
        });
      }
    }
    completed = !writable.destroyed;
    if (completed) writable.end();
  } finally {
    if (reader && !completed) {
      try { await reader.cancel(); } catch { /* The source may already be aborted. */ }
    }
    releaseExternalResponse(response);
  }
}
