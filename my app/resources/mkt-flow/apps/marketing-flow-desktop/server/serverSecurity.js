export const DEFAULT_SERVER_HOST = '127.0.0.1';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const DEFAULT_LOCAL_PORTS = new Set(['3002', '5173']);

export function resolveServerHost(env = process.env) {
  const configuredHost = String(env.MARKETING_FLOW_SERVER_HOST || '').trim().toLowerCase();
  return LOCAL_HOSTS.has(configuredHost) ? configuredHost : DEFAULT_SERVER_HOST;
}

export function isAllowedLocalOrigin(origin, env = process.env) {
  if (!origin) return true;

  try {
    const parsed = new URL(origin);
    const allowedPorts = new Set(DEFAULT_LOCAL_PORTS);
    for (const value of [env.PORT, env.VITE_PORT]) {
      const port = Number.parseInt(value, 10);
      if (Number.isInteger(port) && port > 0 && port <= 65_535) allowedPorts.add(String(port));
    }
    return ['http:', 'https:'].includes(parsed.protocol)
      && LOCAL_HOSTS.has(parsed.hostname)
      && allowedPorts.has(parsed.port);
  } catch {
    return false;
  }
}

export function maskSecret(value) {
  const secret = String(value || '');
  if (!secret) return '';
  if (secret.length <= 8) return '••••';
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

function sanitizeKeyRecord(record = {}) {
  const { api_key: apiKey, ...safeRecord } = record;
  return {
    ...safeRecord,
    display_key: maskSecret(apiKey),
  };
}

export function sanitizeKeyStore(keyStore = {}) {
  return Object.fromEntries(
    Object.entries(keyStore).map(([provider, records]) => [
      provider,
      Array.isArray(records) ? records.map(sanitizeKeyRecord) : [],
    ]),
  );
}

export function sanitizeNvidiaModels(models = []) {
  if (!Array.isArray(models)) return [];
  return models.map((item) => {
    const model = typeof item === 'string' ? item : item?.model;
    const key = typeof item === 'object' ? item?.key : undefined;
    return {
      model,
      ...(key ? { key_hint: maskSecret(key) } : {}),
    };
  });
}

