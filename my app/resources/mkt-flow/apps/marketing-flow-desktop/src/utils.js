/**
 * Safe UUID Generator
 * Provides a resilient fallback for crypto.randomUUID() when running in non-secure (HTTP) contexts.
 */
export function safeRandomUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // High-quality RFC4122 version 4 compliant UUID generator fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const DEFAULT_MKT_FLOW_ORIGIN = 'http://127.0.0.1:3002';

/**
 * Resolve relative MKT Flow backend paths (`/downloads/...`, `/api/...`) to the local
 * backend origin when running inside Electron `file://` or Omnira Studio's embedded HTTP shell.
 */
export function resolveMktFlowUrl(url) {
  if (!url || typeof url !== 'string') return url || '';
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('blob:') ||
    url.startsWith('data:') ||
    url.startsWith('omni-media://')
  ) {
    return url;
  }
  if (url.startsWith('/api/') || url.startsWith('/downloads/')) {
    if (typeof window !== 'undefined') {
      const origin = window.location?.origin || '';
      const isFile = window.location?.protocol === 'file:';
      const isEmbedded = Boolean(window.omni);
      const isBackendOrigin =
        origin === DEFAULT_MKT_FLOW_ORIGIN ||
        origin === 'http://localhost:3002';
      if (isFile || (isEmbedded && !isBackendOrigin)) {
        return DEFAULT_MKT_FLOW_ORIGIN + url;
      }
    }
  }
  return url;
}

/**
 * Extract clean basename (without query parameters) from a `/downloads/...` or full backend URL.
 */
export function extractMktFlowFilename(url) {
  if (!url || typeof url !== 'string') return '';
  const lastSegment = (url.split('/').pop() || '').split('?')[0];
  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}

// ─── Shared AI Config Utilities ────────────────────────────────────────────────
// Centralised here to avoid copy-paste across every component.

/** All known model → provider mappings. */
const PROVIDER_BY_MODEL = {
  'gemini-3.5-flash':          'gemini',
  'gemini-3.1-flash':          'gemini',
  'gemini-3.1-flash-lite':     'gemini',
  'gemini-flash-latest':       'gemini',
  'gemini-flash-lite-latest':  'gemini',
  'gpt-4o-mini':               'openai',
  'gpt-4o':                    'openai',
  'gpt-3.5-turbo':             'openai',
};

/**
 * Read a key from localStorage.
 * Supports both new array format `[{key: '...'}]` and legacy plain string.
 */
export function getStoredKey(newKey, oldKey) {
  try {
    const arr = JSON.parse(localStorage.getItem(newKey) || 'null');
    if (Array.isArray(arr) && arr.length > 0) return arr.map(k => k.key).join('\n');
  } catch (_) { /* ignore parse errors */ }
  return localStorage.getItem(oldKey) || '';
}

export const DEFAULT_NVIDIA_MODELS = [
  { model: 'deepseek-ai/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { model: 'deepseek-ai/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { model: 'moonshotai/kimi-k2.6', label: 'Kimi K2.6' },
  { model: 'google/gemma-4-31b-it', label: 'Gemma 4 31B IT' },
  { model: 'google/diffusiongemma-26b-a4b-it', label: 'DiffusionGemma 26B' },
  { model: 'nvidia/nemotron-3-ultra-550b-a55b', label: 'Nemotron 3 Ultra 550B' },
  { model: 'nvidia/nemotron-3.5-bolt-e4b', label: 'Nemotron 3.5 Bolt' },
  { model: 'mistralai/mistral-large-4-1t-a52b', label: 'Mistral Large 4 1T' },
  { model: 'openai/gpt-oss-20b', label: 'GPT OSS 20B' }
];

export function getNvidiaModels() {
  try {
    const arr = JSON.parse(localStorage.getItem('marketing_nvidia_custom_models') || '[]');
    if (Array.isArray(arr) && arr.length > 0) return arr;
  } catch (_) {
    /* ignore */
  }
  return DEFAULT_NVIDIA_MODELS;
}

function buildProviderMap() {
  const map = { ...PROVIDER_BY_MODEL };
  getGeminiModels().forEach(item => { map[item.value] = 'gemini'; });
  getNvidiaModels().forEach(item => { map[item.model] = 'nvidia'; });
  DEFAULT_NVIDIA_MODELS.forEach(item => { map[item.model] = 'nvidia'; });
  return map;
}

export function hasProviderKey(provider) {
  try {
    const configured = JSON.parse(localStorage.getItem('marketing_configured_providers') || '[]');
    return Array.isArray(configured) && configured.includes(provider);
  } catch (_) {
    return false;
  }
}

/**
 * Determine the best AI model to use on mount.
 * Priority order: last saved model → gemini → openai → claude → deepseek → nvidia.
 * @param {string} storageKey  localStorage key where the last model name is persisted.
 */
export function getInitialModel(storageKey) {
  const providerMap = buildProviderMap();
  const savedModel = localStorage.getItem(storageKey);
  if (savedModel && providerMap[savedModel] && hasProviderKey(providerMap[savedModel])) return savedModel;

  if (hasProviderKey('gemini')) {
    const models = getGeminiModels();
    const has35 = models.some(m => m.value === 'gemini-3.5-flash');
    if (has35) return 'gemini-3.5-flash';
    return models[0]?.value || '';
  }
  if (hasProviderKey('openai'))   return 'gpt-4o-mini';

  const nvidiaModels = getNvidiaModels();
  if (nvidiaModels.length > 0)   return nvidiaModels[0].model;

  return '';
}

/**
 * Resolve provider for the given model.
 * @param {string} selectedModel
 * @returns {{ provider: string, model: string }}
 */
export function getAIApiConfig(selectedModel) {
  const providerMap = buildProviderMap();
  const provider = providerMap[selectedModel] || 'gemini';

  return { provider, model: selectedModel };
}

/**
 * Render a <select> option list for model selection.
 * Returns an array of <optgroup> JSX elements (to be used inside a <select>).
 * NOTE: Import React in the consuming component — this returns raw JSX.
 */
export function buildModelOptions() {
  const nvidiaModels = getNvidiaModels();
  const geminiKey = hasProviderKey('gemini');
  const openaiKey = hasProviderKey('openai');
  const hasAnyKey = geminiKey || openaiKey || nvidiaModels.length > 0;

  return { geminiKey, openaiKey, nvidiaModels, hasAnyKey };
}

/**
 * Fetch dynamic models from Gemini API.
 */
export async function fetchGeminiModels() {
  try {
    const response = await fetch('/api/gemini/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const json = await response.json();
    if (json.success && json.models) {
      localStorage.setItem('gemini_api_models', JSON.stringify(json.models));
      // Dispatch custom event to notify UI components to reload list
      window.dispatchEvent(new CustomEvent('gemini_models_updated'));
      return json.models;
    }
  } catch (err) {
    console.warn('Failed to fetch dynamic models:', err.message);
  }
  return [];
}

/**
 * Get cached dynamic models or default fallbacks.
 */
export function getGeminiModels() {
  // Keywords forbidden in model ID (value)
  const forbiddenByValue = ['nano', 'banana', 'lyria', 'anty', 'anti', 'robotic', 'robot', 'antigravity', 'bison', 'aqa', 'gemma', 'tts', 'embedding', 'veo', 'imagen', 'computer-use', 'customtools'];
  // Keywords forbidden in display label
  const forbiddenByLabel = [...forbiddenByValue, 'nano', 'banana', 'deep research', 'deep-research'];
  try {
    const stored = localStorage.getItem('gemini_api_models');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const filtered = parsed.filter(item => {
          if (!item.value) return false;
          const mName = item.value.toLowerCase();
          // Must be a gemini model
          if (!mName.includes('gemini')) return false;
          // Filter by value forbidden keywords
          if (forbiddenByValue.some(kw => mName.includes(kw))) return false;
          // Filter by label forbidden keywords
          if (item.label) {
            const lName = item.label.toLowerCase();
            if (forbiddenByLabel.some(kw => lName.includes(kw))) return false;
          }
          // Version check: must be >= 1.5 or an alias/exp model
          const isExp = mName.includes('gemini-exp');
          const isAlias15 = mName === 'gemini-flash' ||
                            mName === 'gemini-pro' ||
                            mName === 'gemini-flash-latest' ||
                            mName === 'gemini-pro-latest' ||
                            mName === 'gemini-flash-lite-latest' ||
                            mName === 'gemini-flash-lite';
          let isVersionValid = false;
          const versionMatch = mName.match(/gemini-(\d+(?:\.\d+)?)/);
          if (versionMatch) {
            const version = parseFloat(versionMatch[1]);
            if (version >= 1.5) isVersionValid = true;
          }
          return isVersionValid || isExp || isAlias15;
        });
        if (filtered.length > 0) return filtered;
        // If nothing passed the filter, clear the stale cache
        localStorage.removeItem('gemini_api_models');
      }
    }
  } catch (_) {
    localStorage.removeItem('gemini_api_models');
  }
  return [];
}
