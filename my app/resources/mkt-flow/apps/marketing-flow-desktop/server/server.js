import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { keyManager } from './keyManager.js';
import { fetchDouyinMetadata } from './douyinClient.js';
import { fetchYouTubeInfo, streamYouTubeMedia } from './ytdlpEngine.js';
import { buildFreshDownloadUrl } from './downloadUrls.js';
import { resolveServerPort } from './runtimeConfig.js';
import { resolveWithinDirectory } from './fileSecurity.js';
import {
  fetchExternalWithTimeout as fetchWithTimeout,
  pipeExternalResponse,
  readResponseText,
  releaseExternalResponse,
} from './externalRequests.js';
import {
  isAllowedLocalOrigin,
  resolveServerHost,
  sanitizeKeyStore,
  sanitizeNvidiaModels,
} from './serverSecurity.js';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import {
  buildDubbedAudioFilters,
  computeDubbingTempo,
  decodeAudioBase64Payload,
  normalizeAudioMode,
  requireDemucsRuntime,
  separateNoVocalsStem,
  verifyDemucsRuntime,
} from '../../../packages/media-processing/src/audioProcessing.js';
import { detectVideoPlatform } from '../../../packages/video-downloader/src/platforms.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../../..');

let ffmpegPath = ffmpegStatic;
if (ffmpegPath && ffmpegPath.includes('app.asar')) {
  ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
}
const ffmpegFallbacks = [
  ffmpegPath,
  path.join(workspaceRoot, 'runtime', 'bin', 'ffmpeg.exe'),
  path.join(workspaceRoot, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
  path.join(workspaceRoot, '..', 'my app', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
  'C:\\Users\\nminh\\Desktop\\vibe - code\\omni\\mkt-flow\\runtime\\bin\\ffmpeg.exe',
  'C:\\Users\\nminh\\Desktop\\vibe - code\\MKT FLOW\\runtime\\bin\\ffmpeg.exe'
];
for (const cand of ffmpegFallbacks) {
  if (cand && fs.existsSync(cand)) {
    ffmpegPath = cand;
    break;
  }
}
ffmpeg.setFfmpegPath(ffmpegPath);

const ffprobeFallbacks = [
  path.join(workspaceRoot, 'runtime', 'bin', 'ffprobe.exe'),
  path.join(workspaceRoot, '..', 'my app', 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe'),
  'C:\\Users\\nminh\\Desktop\\vibe - code\\omni\\mkt-flow\\runtime\\bin\\ffprobe.exe',
  'C:\\Users\\nminh\\Desktop\\vibe - code\\MKT FLOW\\runtime\\bin\\ffprobe.exe'
];
for (const cand of ffprobeFallbacks) {
  if (cand && fs.existsSync(cand)) {
    ffmpeg.setFfprobePath(cand);
    break;
  }
}

let verifiedDemucsRuntime;

async function getVerifiedDemucsRuntime() {
  const runtime = requireDemucsRuntime({
    projectDir: workspaceRoot,
    resourcesDir: process.resourcesPath,
  });

  if (!verifiedDemucsRuntime || verifiedDemucsRuntime.pythonPath !== runtime.pythonPath) {
    await verifyDemucsRuntime(runtime);
    verifiedDemucsRuntime = runtime;
  }

  return verifiedDemucsRuntime;
}
const bundledDatabaseDir = path.join(workspaceRoot, 'runtime', 'database');
const databaseDir = process.env.USER_DATA_PATH
  ? path.join(process.env.USER_DATA_PATH, 'db')
  : bundledDatabaseDir;

// Helper to clean markdown code blocks and parse JSON safely
function cleanAndParseJSON(str) {
  if (typeof str !== 'string') return str;
  let cleanStr = str.trim();
  if (cleanStr.startsWith('```')) {
    cleanStr = cleanStr.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');
  }
  cleanStr = cleanStr.trim();
  try {
    return JSON.parse(cleanStr);
  } catch (e) {
    console.warn('[JSON Parser] Failed to parse string, returning clean string:', e.message);
    return cleanStr;
  }
}

const app = express();
const PORT = resolveServerPort();
const HOST = resolveServerHost();
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_FALLBACK_MODELS = [DEFAULT_GEMINI_MODEL, 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
const ALLOWED_KEY_PROVIDERS = new Set(['gemini', 'openai', 'nvidia']);
const MAX_API_KEY_LENGTH = 512;

app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) {
    if (isAllowedLocalOrigin(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed'));
  },
}));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Local Auth Token Middleware: Bắt buộc mọi request /api/* phải có header X-Omni-Token hợp lệ
app.use('/api', (req, res, next) => {
  const localAuthToken = process.env.LOCAL_AUTH_TOKEN;
  if (localAuthToken) {
    const clientToken = req.headers['x-omni-token'] || req.query?.token;
    if (!clientToken || clientToken !== localAuthToken) {
      return res.status(401).json({
        error: 'Unauthorized: Missing or invalid X-Omni-Token header'
      });
    }
  }
  next();
});

app.get('/api/runtime-info', (req, res) => {
  res.json({
    app: 'marketing-flow',
    audioPipeline: 'demucs-minus-vocals-v2',
    port: PORT,
  });
});

// --- KEY MANAGER ENDPOINTS ---

app.get('/api/keys', (req, res) => {
  keyManager.load();
  res.json(sanitizeKeyStore(keyManager.keys));
});

app.post('/api/keys/reset-all', (req, res) => {
  keyManager.load();
  for (const p of Object.keys(keyManager.keys)) {
    for (const k of keyManager.keys[p]) {
      k.status = 'ACTIVE';
      k.fail_count = 0;
      k.reset_at = null;
    }
  }
  keyManager.save();
  res.json({ ok: true, keys: sanitizeKeyStore(keyManager.keys) });
});

app.post('/api/keys', (req, res) => {
  const { provider, apiKey } = req.body;
  if (!provider || !apiKey) return res.status(400).json({ error: 'Missing provider or apiKey' });
  if (!ALLOWED_KEY_PROVIDERS.has(provider)) return res.status(400).json({ error: 'Unsupported provider' });
  if (typeof apiKey !== 'string' || apiKey.length < 8 || apiKey.length > MAX_API_KEY_LENGTH) {
    return res.status(400).json({ error: 'Invalid API key length' });
  }
  const key = keyManager.addKey(provider, apiKey.trim());
  if (!key) return res.status(400).json({ error: 'Key already exists' });
  const safeKey = sanitizeKeyStore({ [provider]: [key] })[provider][0];
  res.json({ success: true, key: safeKey });
});

app.delete('/api/keys/:provider/:id', (req, res) => {
  const { provider, id } = req.params;
  const success = keyManager.deleteKey(provider, id);
  if (success) res.json({ success: true });
  else res.status(404).json({ error: 'Key not found' });
});

app.post('/api/keys/unlock/:provider/:id', (req, res) => {
  const { provider, id } = req.params;
  const success = keyManager.unlockKey(provider, id);
  if (success) res.json({ success: true });
  else res.status(404).json({ error: 'Key not found' });
});

app.post('/api/keys/migrate', (req, res) => {
  const { keys } = req.body; // { gemini: ['key1', 'key2'], openai: ['key3'] }
  if (!keys) return res.status(400).json({ error: 'Missing keys object' });
  let added = 0;
  for (const [provider, keyList] of Object.entries(keys)) {
    if (ALLOWED_KEY_PROVIDERS.has(provider) && Array.isArray(keyList)) {
      for (const k of keyList.slice(0, 50)) {
        if (typeof k !== 'string' || k.length < 8 || k.length > MAX_API_KEY_LENGTH) continue;
        if (keyManager.addKey(provider, k)) {
          added++;
        }
      }
    }
  }
  res.json({ success: true, added });
});

// --- END KEY MANAGER ENDPOINTS ---

// --- VERSION ENDPOINT ---
app.get('/api/version', (req, res) => {
  try {
    const rootPkgPath = path.resolve(__dirname, '../../../package.json');
    const localPkgPath = path.resolve(__dirname, '../package.json');
    const targetPath = fs.existsSync(rootPkgPath) ? rootPkgPath : localPkgPath;
    if (fs.existsSync(targetPath)) {
      const pkg = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
      return res.json({ version: pkg.version });
    }
  } catch (e) {
    console.warn('[Version API] Error reading package.json:', e.message);
  }
  res.json({ version: '1.2.2' });
});
// --- END VERSION ENDPOINT ---

// --- MODEL REGISTRY ENDPOINT ---
app.get('/api/model-registry', (req, res) => {
  try {
    const userRegistryPath = path.join(databaseDir, 'model_registry.json');
    const registryPath = fs.existsSync(userRegistryPath)
      ? userRegistryPath
      : path.join(bundledDatabaseDir, 'model_registry.json');
    const data = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    res.json(data);
  } catch (err) {
    console.warn('[Model Registry] Could not load registry:', err.message);
    res.json({ version: '1.0', models: {}, default_profiles: {} });
  }
});
// --- END MODEL REGISTRY ENDPOINT ---

// --- NVIDIA MODELS STORE (model + key pairs) ---
// Backend lưu danh sách { model, key } để Orchestrator đọc được
let _nvidiaModelsCache = [];
const NVIDIA_MODELS_FILE = path.join(databaseDir, 'nvidia_models.json');

// Load khi start
try {
  if (fs.existsSync(NVIDIA_MODELS_FILE)) {
    _nvidiaModelsCache = JSON.parse(fs.readFileSync(NVIDIA_MODELS_FILE, 'utf-8'));
  }
} catch (e) { console.warn('[NvidiaModels] Could not load:', e.message); }

app.get('/api/nvidia-models', (req, res) => {
  res.json(sanitizeNvidiaModels(_nvidiaModelsCache));
});

app.post('/api/nvidia-models', (req, res) => {
  const { models } = req.body; // [{ model, key? }]
  if (!Array.isArray(models)) return res.status(400).json({ error: 'models must be array' });
  if (models.length > 100) return res.status(400).json({ error: 'Too many models' });
  const validatedModels = models.map((item) => ({
    model: typeof item?.model === 'string' ? item.model.trim() : (typeof item === 'string' ? item.trim() : ''),
    key: typeof item?.key === 'string' ? item.key.trim() : '',
  }));
  if (validatedModels.some(({ model, key }) => !model || model.length > 200 || (key && (key.length < 8 || key.length > MAX_API_KEY_LENGTH)))) {
    return res.status(400).json({ error: 'Invalid model or key data' });
  }
  _nvidiaModelsCache = validatedModels;
  try {
    fs.writeFileSync(NVIDIA_MODELS_FILE, JSON.stringify(validatedModels, null, 2));
  } catch (error) {
    console.warn('[NvidiaModels] Could not save:', error.message);
  }
  res.json({ success: true, count: validatedModels.length });
});
// --- END NVIDIA MODELS STORE ---

app.post('/api/debug-models', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'Missing apiKey' });
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models';
    const response = await axios.get(url, { headers: { 'x-goog-api-key': apiKey } });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// Get dynamic models from Gemini API Key(s)
app.post('/api/gemini/models', async (req, res) => {
  const geminiKeys = keyManager.getAllKeys('gemini').filter(k => k.status === 'ACTIVE').map(k => k.api_key);
  const keyPool = [...geminiKeys];
  
  if (req.body.apiKey) {
    req.body.apiKey.split(/[\s,;\n]+/).filter(Boolean).forEach(k => {
      if (!keyPool.includes(k)) keyPool.push(k);
    });
  }
  
  if (keyPool.length === 0 && process.env.GEMINI_API_KEY) {
    keyPool.push(process.env.GEMINI_API_KEY);
  }

  if (keyPool.length === 0) {
    return res.json({ success: true, models: [] });
  }

  const allModels = new Map();
  
  for (const key of keyPool) {
    try {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models';
      const response = await axios.get(url, {
        headers: { 'x-goog-api-key': key },
        timeout: 10000
      });
      if (response.data && response.data.models) {
        response.data.models.forEach(m => {
          if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')) {
            const shortName = m.name.replace('models/', '');
            const mName = shortName.toLowerCase();

            if (!mName.includes('gemini')) return;

            const forbiddenByValue = ['nano', 'banana', 'lyria', 'anty', 'anti', 'robotic', 'robot', 'deep', 'antigravity', 'bison', 'aqa', 'gemma', 'tts', 'embedding', 'veo', 'imagen', 'computer-use', 'customtools'];
            if (forbiddenByValue.some(kw => mName.includes(kw))) return;

            const displayName = (m.displayName || shortName).toLowerCase();
            const forbiddenByLabel = [...forbiddenByValue, 'deep research', 'deep-research'];
            if (forbiddenByLabel.some(kw => displayName.includes(kw))) return;

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
            
            if (!isVersionValid && !isExp && !isAlias15) return;

            allModels.set(shortName, {
              value: shortName,
              label: m.displayName || shortName
            });
          }
        });
      }
    } catch (err) {
      console.warn(`[Gemini Models list] Failed to fetch models for key suffix ...${key.slice(-4)}: ${err.message}`);
    }
  }

  res.json({ success: true, models: Array.from(allModels.values()) });
});

// Multi-platform Video Info Endpoint
app.post('/api/video/info', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL không được để trống' });
  }

  const platform = detectVideoPlatform(url);
  if (!platform) {
    return res.status(400).json({ success: false, error: 'Chỉ hỗ trợ URL TikTok, Douyin hoặc YouTube.' });
  }

  try {
    if (platform === 'youtube') {
      const info = await fetchYouTubeInfo(url);
      return res.json({
        success: true,
        data: {
          title: info.title,
          cover: info.cover,
          play: info.originalUrl,
          music_info: { play: info.originalUrl },
          author: { unique_id: info.author },
          platform,
          originalUrl: url,
        },
      });
    }

    if (platform === 'douyin') {
      const response = await fetchDouyinMetadata(url);
      const data = response?.result?.data;
      if (!response?.status || !response.result?.status || !data) {
        return res.status(400).json({ success: false, error: 'Không thể lấy thông tin video Douyin.' });
      }

      return res.json({
        success: true,
        data: {
          title: data.title || 'Video Douyin',
          cover: data.thumbnail || '',
          play: data.links?.[0]?.url || '',
          music_info: data.links?.[2]?.url ? { play: data.links[2].url } : null,
          author: { unique_id: 'douyin_user' },
          platform,
          originalUrl: url,
        },
      });
    }

    const response = await axios.get('https://www.tikwm.com/api/', {
      params: { url, hd: '1' },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (response.data && response.data.code === 0) {
      return res.json({
        success: true,
        data: { ...response.data.data, platform, originalUrl: url },
      });
    }

    return res.status(400).json({ success: false, error: response.data.msg || 'Không thể lấy thông tin video.' });
  } catch (error) {
    console.error('Video info error:', error.message);
    return res.status(500).json({ success: false, error: 'Lỗi hệ thống khi tải video.' });
  }
});

// Multi-platform Proxy Download Endpoint
app.get('/api/video/download', async (req, res) => {
  const { url, name, platform, originalUrl, type } = req.query;
  if (!['tiktok', 'douyin', 'youtube'].includes(platform)) {
    return res.status(400).send('Nền tảng video không hợp lệ.');
  }
  if (!url && platform !== 'youtube') {
    return res.status(400).send('Thiếu link tải video');
  }

  try {
    if (platform === 'youtube') {
      const targetUrl = originalUrl || url;
      return streamYouTubeMedia(targetUrl, type, name, res, ffmpegPath);
    }

    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, 30_000);

    if (!response.ok) {
      await response.body?.cancel?.();
      releaseExternalResponse(response);
      return res.status(502).send(`Server nguồn trả về HTTP ${response.status}.`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    if (!/^(audio|video)\//iu.test(contentType) && !contentType.toLowerCase().startsWith('application/octet-stream')) {
      await response.body?.cancel?.();
      releaseExternalResponse(response);
      return res.status(415).send('Server nguồn không trả về tệp audio/video hợp lệ.');
    }
    const filename = name || (contentType.includes('audio') ? 'video_audio.mp3' : 'video.mp4');

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Disposition');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    await pipeExternalResponse(response, res);
  } catch (error) {
    console.error('Download proxy error:', error.message);
    if (res.headersSent) return res.destroy(error);
    res.status(500).send('Không thể tải file từ server nguồn.');
  }
});

// Helper to parse base64 image format for Gemini Multimodal API
function parseBase64Image(base64Str) {
  if (!base64Str || !base64Str.startsWith("data:")) return null;
  const match = base64Str.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2]
  };
}

function extractFacebookMetrics(html) {
  let likes = "Không rõ (hoặc 0)";
  let comments = "Không rõ (hoặc 0)";
  let shares = "Không rõ (hoặc 0)";
  let postContent = "";

  // 1. Try to extract from mbasic specific links / selectors
  const reactionLinkMatch = html.match(/href="[^"]*\/ufi\/reaction\/profile\/browser\/[^"]*"[^>]*>(.*?)<\/a>/i);
  if (reactionLinkMatch) {
    likes = reactionLinkMatch[1].trim();
  } else {
    const likesPattern = /([\d.,]+[KkMmb]?)\s*(người thích|lượt thích|thích|likes|lượt cảm xúc|cảm xúc)/gi;
    const likesMatches = [...html.matchAll(likesPattern)];
    if (likesMatches.length > 0) {
      likes = likesMatches[0][1] + " " + likesMatches[0][2];
    }
  }

  const commentsLinkMatch = html.match(/href="[^"]*#comments_anchor"[^>]*>(.*?)<\/a>/i);
  if (commentsLinkMatch) {
    comments = commentsLinkMatch[1].trim();
  } else {
    const commentsPattern = /([\d.,]+[KkMmb]?)\s*(bình luận|comments)/gi;
    const commentsMatches = [...html.matchAll(commentsPattern)];
    if (commentsMatches.length > 0) {
      comments = commentsMatches[0][1] + " " + commentsMatches[0][2];
    }
  }

  const sharesLinkMatch = html.match(/href="[^"]*\/shares\/view\/[^"]*"[^>]*>(.*?)<\/a>/i);
  if (sharesLinkMatch) {
    shares = sharesLinkMatch[1].trim();
  } else {
    const sharesPattern = /([\d.,]+[KkMmb]?)\s*(lượt chia sẻ|chia sẻ|shares)/gi;
    const sharesMatches = [...html.matchAll(sharesPattern)];
    if (sharesMatches.length > 0) {
      shares = sharesMatches[0][1] + " " + sharesMatches[0][2];
    }
  }

  // 2. Extract post body text
  const postBodyMatch = html.match(/<div class="[^"]*msg[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                        html.match(/<div class="story_body_container"[^>]*>([\s\S]*?)<\/div>/i) ||
                        html.match(/<div data-ft="[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                        html.match(/<div class="[^"]*_(?:5rgt|5pat)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  
  if (postBodyMatch) {
    postContent = postBodyMatch[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  likes = likes.replace(/<[^>]+>/g, "").trim();
  comments = comments.replace(/<[^>]+>/g, "").trim();
  shares = shares.replace(/<[^>]+>/g, "").trim();

  if (likes === "Không rõ (hoặc 0)" || likes === "") {
    const m = html.match(/([\d.,]+[KkMmb]?)\s*(người thích|lượt thích|thích|likes|lượt cảm xúc|cảm xúc)/i);
    if (m) likes = m[1] + " " + m[2];
  }
  if (comments === "Không rõ (hoặc 0)" || comments === "") {
    const m = html.match(/([\d.,]+[KkMmb]?)\s*(bình luận|comments)/i);
    if (m) comments = m[1] + " " + m[2];
  }
  if (shares === "Không rõ (hoặc 0)" || shares === "") {
    const m = html.match(/([\d.,]+[KkMmb]?)\s*(lượt chia sẻ|chia sẻ|shares)/i);
    if (m) shares = m[1] + " " + m[2];
  }

  return { likes, comments, shares, postContent };
}

const crawlCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache TTL
const CRAWL_CACHE_MAX_ENTRIES = 100;

async function crawlUrl(url) {
  const cached = crawlCache.get(url);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    crawlCache.delete(url);
    crawlCache.set(url, cached);
    console.log(`[Crawler Cache] Returning cached content for: ${url}`);
    return cached.content;
  }
  if (cached) crawlCache.delete(url);

  try {
    let targetUrl = url.trim();
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = "https://" + targetUrl;
    }

    const isFacebook = targetUrl.includes("facebook.com");

    // 1. Resolve mobile share links or short links using redirect follow
    if (isFacebook && targetUrl.includes("/share/")) {
      try {
        const tempRes = await fetchWithTimeout(targetUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
          },
          redirect: "follow"
        }, 8000);
        if (tempRes.url && tempRes.url !== targetUrl) {
          targetUrl = tempRes.url;
        }
      } catch (err) {
        console.warn("[Facebook Share Link Resolver] Failed to resolve redirect:", err);
      }
    }

    // 2. Convert Facebook URL to mbasic.facebook.com to bypass dynamic rendering, unless it's a specific non-supported subpage like ads library
    let convertToMbasic = isFacebook && !targetUrl.includes("mbasic.facebook.com") && !targetUrl.includes("/ads/library");
    let crawlUrlStr = targetUrl;
    if (convertToMbasic) {
      crawlUrlStr = targetUrl.replace(/(www\.|web\.)?facebook\.com/i, "mbasic.facebook.com");
    }

    let res = await fetchWithTimeout(crawlUrlStr, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    }, 8000);

    let html = await readResponseText(res);
    let isLoginWall = isFacebook && (html.includes("login_form") || html.includes("/login/") || html.includes("checkpoint") || html.includes("login_form_container"));

    // 3. Fallback to public embed plugin if mbasic hits a login wall
    if (isFacebook && isLoginWall) {
      console.log(`[Facebook Crawler] mbasic hit login wall. Trying public embed fallback...`);
      try {
        const embedUrl = `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(targetUrl)}`;
        const embedRes = await fetchWithTimeout(embedUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7"
          }
        }, 8000);
        if (embedRes.ok) {
          const embedHtml = await readResponseText(embedRes);
          if (!embedHtml.includes("login_form") && !embedHtml.includes("/login/") && !embedHtml.includes("checkpoint")) {
            html = embedHtml;
            isLoginWall = false;
          }
        }
      } catch (embedErr) {
        console.warn("[Facebook Crawler] Embed fallback failed:", embedErr);
      }
    }

    if (!res.ok && !html) {
      return `[Lỗi kết nối liên kết ${url}: HTTP ${res.status}]`;
    }

    // 4. Handle final login wall warning
    if (isFacebook && isLoginWall) {
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : "Facebook";
      return `[Facebook yêu cầu đăng nhập để xem nội dung đầy đủ. Tiêu đề liên kết: "${title}"]\n(Vui lòng cung cấp link công khai hoặc bài đăng công khai để các tác nhân đọc được nội dung chi tiết).`;
    }

    // Extract title
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "Không tiêu đề";

    // Clean html tags to extract text content as a fallback
    let text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const trimmedText = text.length > 3000 ? text.substring(0, 3000) + "..." : text;

    // 5. If it's Facebook, extract and structure post metrics
    let result = "";
    if (isFacebook) {
      const fb = extractFacebookMetrics(html);
      let resText = `=== [KẾT QUẢ PHÂN TÍCH BÀI VIẾT FACEBOOK] ===\n`;
      resText += `- Tiêu đề bài viết: "${title}"\n`;
      resText += `- Đường dẫn gốc: ${url}\n`;
      resText += `- Số lượng Cảm xúc/Like: ${fb.likes}\n`;
      resText += `- Số lượng Bình luận: ${fb.comments}\n`;
      resText += `- Số lượng Chia sẻ: ${fb.shares}\n\n`;
      resText += `--- NỘI DUNG CHI TIẾT BÀI VIẾT ---\n`;
      if (fb.postContent) {
        resText += `"""\n${fb.postContent}\n"""\n`;
      } else {
        resText += `"""\n${trimmedText}\n"""\n`;
      }
      resText += `==========================================`;
      result = resText;
    } else {
      result = `Tiêu đề trang: "${title}"\nNội dung văn bản trích xuất từ trang:\n"""\n${trimmedText}\n"""`;
    }

    if (crawlCache.size >= CRAWL_CACHE_MAX_ENTRIES) {
      crawlCache.delete(crawlCache.keys().next().value);
    }
    crawlCache.set(url, { content: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    return `[Lỗi truy cập đường dẫn ${url}: ${err.message || err}]`;
  }
}

// Helper to perform web searches using DuckDuckGo HTML
async function searchWeb(query) {
  try {
    const q = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${q}`;
    console.log(`[Web Search] Querying DuckDuckGo: ${query}`);
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    }, 8000);

    if (!response.ok) {
      console.warn(`[Web Search] Search query failed with status: ${response.status}`);
      return [];
    }

    const html = await readResponseText(response);
    const matches = [];
    const regex = /<a class="result__url"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    
    let match;
    while ((match = regex.exec(html)) !== null && matches.length < 5) {
      matches.push({
        url: match[1].trim(),
        title: match[2].replace(/<[^>]+>/g, '').trim(),
        snippet: match[3].replace(/<[^>]+>/g, '').trim()
      });
    }
    console.log(`[Web Search] Found ${matches.length} results for query "${query}"`);
    return matches;
  } catch (e) {
    console.error(`[Web Search] Search failed for query "${query}":`, e.message);
    return [];
  }
}

// Helper to extract product keywords from uploaded image (Google Lens emulation)
async function analyzeImageKeywords(image, callFn) {
  const prompt = `Hãy đóng vai trò là công cụ tìm kiếm hình ảnh cao cấp (như Google Lens). Phân tích hình ảnh sản phẩm này và trích xuất thông tin chi tiết dưới dạng JSON:
1. Tên sản phẩm chính xác nhất (bằng tiếng Việt hoặc tiếng Anh)
2. Nhãn hiệu / Thương hiệu (nếu có nhìn thấy rõ)
3. Các từ khóa tìm kiếm (search terms) tốt nhất bằng tiếng Việt và tiếng Anh để tìm kiếm sản phẩm này trên các sàn thương mại điện tử hoặc mạng xã hội.
4. Một câu truy vấn tìm kiếm (search query) tổng hợp tốt nhất để tìm kiếm sản phẩm này trên Google.
5. Từ khóa tìm kiếm tối ưu nhất bằng Tiếng Khmer (search_query_khmer) để tìm kiếm sản phẩm này trên Facebook Ads Library tại Campuchia.

BẮT BUỘC trả về dưới dạng JSON thuần (KHÔNG có markdown block, KHÔNG có wrapper):
{
  "product_name": "Tên sản phẩm",
  "brand": "Thương hiệu",
  "keywords": ["từ khóa 1", "từ khóa 2"],
  "search_query": "truy vấn tìm kiếm",
  "search_query_khmer": "từ khóa tiếng Khmer"
}`;
  
  const systemInstruction = "Bạn là một AI phân tích hình ảnh chuyên nghiệp. Trả về duy nhất kết quả dạng JSON khớp chính xác schema được yêu cầu.";
  
  const responseSchema = {
    type: "object",
    properties: {
      product_name: { type: "string" },
      brand: { type: "string" },
      keywords: { type: "array", items: { type: "string" } },
      search_query: { type: "string" },
      search_query_khmer: { type: "string" }
    },
    required: ["product_name", "keywords", "search_query", "search_query_khmer"]
  };

  try {
    console.log('[MarketIntelligence Image Analysis] Running multimodal AI pass...');
    let result = await callFn(prompt, systemInstruction, responseSchema, 0.3, image);
    if (typeof result === 'string') {
      result = cleanAndParseJSON(result);
    }
    console.log('[MarketIntelligence Image Analysis] Extracted metadata:', result);
    return result;
  } catch (err) {
    console.warn('[MarketIntelligence Image Analysis] Failed to extract metadata:', err.message);
    return null;
  }
}

// Helper to translate Vietnamese product name/keyword to Khmer search keyword
async function translateToKhmerKeyword(productName, callFn) {
  const prompt = `Hãy đóng vai trò là một chuyên gia bản dịch Marketing tại Campuchia. Hãy dịch tên sản phẩm sau đây sang Tiếng Khmer ngắn gọn, tự nhiên nhất để dùng làm từ khóa tìm kiếm (search keyword) trên Facebook Ads Library tại Campuchia.
YÊU CẦU: Chỉ trả về từ khóa bằng chữ Khmer (ví dụ: កាវបិទជញ្ជាំង), tuyệt đối không thêm lời giải thích, không dịch nghĩa, không thêm tiếng Việt hay tiếng Anh.

Tên sản phẩm cần dịch: ${productName}`;
  
  const systemInstruction = "Bạn là chuyên gia dịch thuật từ khóa marketing sang Tiếng Khmer. Trả về duy nhất từ khóa dạng text bằng tiếng Khmer.";
  
  try {
    console.log(`[Khmer Translation] Translating product name to Khmer: ${productName}`);
    let result = await callFn(prompt, systemInstruction, null, 0.1);
    if (typeof result === 'string') {
      result = result.trim().replace(/^"|"$/g, '');
    }
    console.log(`[Khmer Translation] Translated result: ${result}`);
    return result || productName;
  } catch (err) {
    console.warn(`[Khmer Translation] Failed to translate product name: ${err.message}`);
    return productName;
  }
}



// AI Helper - Call Gemini API with Fallback Model Chain, Key Rotation, and advanced settings
async function callGemini(prompt, systemInstruction, ignoredApiKey, preferredModel, responseSchema = null, temperature = 0.7, tools = undefined, image = null, signal = undefined) {
  const models = preferredModel ? [preferredModel] : GEMINI_FALLBACK_MODELS;

  return await keyManager.runWithKeyRotation('gemini', async (key) => {
    let lastError = null;

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        
        const parts = [];
        if (image) {
          const parsedImg = parseBase64Image(image);
          if (parsedImg) {
            parts.push({
              inlineData: { mimeType: parsedImg.mimeType, data: parsedImg.data }
            });
          }
        }
        parts.push({ text: prompt });

        const payload = {
          contents: [{ parts: parts }],
          generationConfig: {
            responseMimeType: responseSchema ? 'application/json' : 'text/plain',
            temperature: temperature
          }
        };

        if (responseSchema) payload.generationConfig.responseSchema = responseSchema;
        if (systemInstruction) payload.systemInstruction = { parts: [{ text: systemInstruction }] };
        if (tools) payload.tools = tools;

        const response = await axios.post(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key
          },
          signal,
          timeout: 30000 // 30 seconds timeout per attempt
        });

        if (response.data && response.data.candidates && response.data.candidates[0]?.content?.parts?.[0]?.text) {
          const textResponse = response.data.candidates[0].content.parts[0].text.trim();
          return cleanAndParseJSON(textResponse);
        } else if (response.data?.candidates?.[0]?.finishReason === 'SAFETY') {
          console.warn(`[Gemini] Model ${model}: Response blocked by safety filters. Trying next model...`);
          lastError = new Error('Response blocked by safety filters');
          continue;
        } else if (response.data?.candidates?.[0]?.finishReason === 'RECITATION') {
          console.warn(`[Gemini] Model ${model}: Response blocked for RECITATION. Trying next model...`);
          lastError = new Error('Response blocked due to recitation policy');
          continue;
        }
      } catch (error) {
        const status = error.response?.status;
        const message = error.response?.data?.error?.message || error.message;
        
        // If it's a key/quota/rate-limit issue, THROW immediately to let keyManager handle rotation/backoff
        if ([401, 403, 429, 502, 503, 504].includes(status) || error.code === 'ECONNABORTED') {
          throw error;
        }

        console.warn(`[Gemini] Model ${model} failed (Status: ${status}): ${message}. Trying next fallback model...`);
        lastError = error;
      }
    }

    // If we reach here, all models in the fallback chain failed for this specific key
    throw lastError || new Error(`Gemini API Error: All fallback models failed.`);
  });
}

function isMultimodalModel(modelName, provider) {
  if (!modelName) return false;
  const name = modelName.toLowerCase();
  if (provider === 'gemini' || name.includes('gemini')) return true;
  if (provider === 'openai' || name.startsWith('gpt-')) {
    return name.includes('gpt-4o') || name.includes('vision');
  }

  if (provider === 'nvidia') {
    return name.includes('vision') || name.includes('neva') || name.includes('vl');
  }
  return false;
}



async function callOpenAICompatible(prompt, systemInstruction, ignoredApiKey, provider, model, responseSchema = null, temperature = 0.7, image = null, signal = undefined) {
  let baseUrl = 'https://api.openai.com/v1/chat/completions';
  let modelName = model || 'gpt-4o-mini';

  if (provider === 'nvidia') {
    baseUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
    modelName = model || 'meta/llama-3.1-70b-instruct';
  }

  return await keyManager.runWithKeyRotation(provider, async (key) => {
    const messages = [];
    let combinedSystemInstruction = systemInstruction || '';
    if (responseSchema) {
      combinedSystemInstruction += `\n\nIMPORTANT: Your response MUST be a valid JSON object matching this schema: ${JSON.stringify(responseSchema)}. Output ONLY the raw JSON object, no markdown.`;
    }

    if (combinedSystemInstruction) {
      messages.push({ role: 'system', content: combinedSystemInstruction.trim() });
    }

    let finalPrompt = prompt;
    const multimodal = isMultimodalModel(modelName, provider);

    if (image && multimodal) {
      const parsedImg = parseBase64Image(image);
      if (parsedImg) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: finalPrompt },
            {
              type: 'image_url',
              image_url: { url: `data:${parsedImg.mimeType};base64,${parsedImg.data}` }
            }
          ]
        });
      } else {
        messages.push({ role: 'user', content: finalPrompt });
      }
    } else {
      if (image && !multimodal) {
        finalPrompt += "\n\n[Lưu ý từ hệ thống: Người dùng có tải kèm hình ảnh nhưng mô hình AI này không hỗ trợ thị giác. Hãy tập trung xử lý thông tin dựa trên phần mô tả văn bản].";
      }
      messages.push({ role: 'user', content: finalPrompt });
    }

    const payload = {
      model: modelName,
      messages: messages,
      temperature: temperature
    };

    if (responseSchema && provider !== 'nvidia') {
      payload.response_format = { type: "json_object" };
    }

    try {
      const response = await axios.post(baseUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        signal,
        timeout: 180000
      });

      if (response.data && response.data.choices && response.data.choices[0]?.message?.content) {
        const raw = response.data.choices[0].message.content.trim();
        return cleanAndParseJSON(raw);
      } else {
        throw new Error(`Không nhận được phản hồi từ ${provider.toUpperCase()} API.`);
      }
    } catch (error) {
      const detail = error.response?.data?.detail;
      const errorMsg = detail || error.response?.data?.error?.message || error.message || `Lỗi kết nối tới ${provider.toUpperCase()} API`;
      const status = error.response?.status;
      const providerDisplay = provider === 'nvidia' ? 'NVIDIA NIM' : provider.toUpperCase();
      
      // Wrap specific errors but keep status for runWithKeyRotation
      if (status === 404 || errorMsg.includes('404') || errorMsg.includes('Model not found')) {
        error.message = `Lỗi (404): Model "${modelName}" không tồn tại trên ${providerDisplay}.`;
      }
      throw error;
    }
  });
}

async function callAI(prompt, systemInstruction, provider, apiKey, model, responseSchema = null, temperature = 0.7, image = null, signal = undefined) {
  const prov = provider || 'gemini';
  if (prov === 'gemini') {
    return await callGemini(prompt, systemInstruction, apiKey, model, responseSchema, temperature, undefined, image, signal);
  }
  if (prov === 'openai' || prov === 'nvidia') {
    return await callOpenAICompatible(prompt, systemInstruction, apiKey, prov, model, responseSchema, temperature, image, signal);
  }
  throw new Error(`Provider ${prov} không được hỗ trợ.`);
}

app.post('/api/ai/translate', async (req, res) => {
  const { text, style, length, provider, apiKey, model, replicationMode, framework } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Nội dung gốc không được để trống' });
  }

  let systemInstruction;
  let prompt;

  if (replicationMode === false) {
    if (framework && framework !== 'none') {
      systemInstruction = `Bạn là một chuyên gia Facebook Content Marketing và Copywriter hàng đầu tại Campuchia. 
Nhiệm vụ của bạn là chuyển hóa kịch bản, ý tưởng nội dung thô, thông số sản phẩm hoặc content mẫu từ Tiếng Việt thành bài viết quảng cáo Facebook (Ad Copy) bằng Tiếng Khmer có tỷ lệ nhấp chuột (CTR) và tỷ lệ chuyển đổi cao, và dịch ngược lại bản tiếng Việt tương ứng.

BẮT BUỘC áp dụng khung viết quảng cáo: ${framework}
- PAS (Problem - Agitate - Solve): Xoáy sâu nỗi đau khách hàng Campuchia và đưa sản phẩm làm giải pháp.
- AIDA (Attention - Interest - Desire - Action): Giật tít chặn ngón tay -> Khơi gợi tính năng -> Tạo khao khát -> Thúc đẩy CTA.
- SSS (Star - Story - Solution): Kể câu chuyện thực tế tạo sự tin tưởng tự nhiên.

Quy trình viết bài:
1. Viết bản tiếng Khmer hoàn chỉnh trước, áp dụng đúng cấu trúc của khung ${framework}, xưng hô thân mật chuẩn bản địa bằng "បង" (Bong) (tuyệt đối không viết chữ Latinh "Bong").
2. Dịch/viết ngược lại bản tiếng Việt tương ứng trơn tru, tự nhiên, đồng nhất ý nghĩa.
3. Sử dụng các emoji phù hợp để tăng tính trực quan. Xuống dòng giãn dòng phù hợp.

Trả về kết quả định dạng JSON.`;

      prompt = `Hãy chuyển hóa nội dung sau đây sang bản Tiếng Khmer mới áp dụng khung viết ${framework}, và dịch ngược lại Tiếng Việt:
"""
${text}
"""

BẮT BUỘC kết quả đầu ra khớp chính xác định dạng JSON sau:
{
  "vietnamese": "Nội dung bài viết mới bằng tiếng Việt áp dụng khung ${framework}",
  "khmer": "Nội dung bài viết mới bằng tiếng Khmer áp dụng khung ${framework}"
}`;
    } else {
      systemInstruction = `Bạn là một chuyên gia Facebook Content Marketing và Copywriter hàng đầu tại Campuchia.
Nhiệm vụ của bạn là nhận bản tin/nội dung mẫu đầu vào, sau đó biên tập và nhân bản thành một bản mới tiếng Khmer (và dịch ngược lại tiếng Việt tương ứng) dựa trên Tùy chọn Phong cách viết và Độ dài nội dung được yêu cầu để đạt hiệu quả chuyển đổi và CTR cao nhất.

Quy trình xử lý:
1. Phân tích nội dung gốc, giữ lại thông tin cốt lõi.
2. Viết lại bài mới bằng tiếng Khmer tuân thủ đúng yêu cầu:
   - Phong cách viết: ${style}
   - Độ dài nội dung: ${length}
   - Ngôn từ xưng hô thân mật, dùng từ "បង" (Bong) (tuyệt đối không viết Latinh "Bong").
3. Viết lại bản tiếng Việt tương ứng từ bản tiếng Khmer mới tạo để đảm bảo đồng bộ ý nghĩa và tự nhiên nhất.
4. Trả về kết quả định dạng JSON.`;

      prompt = `Hãy nhân bản/biên tập nội dung mẫu sau đây sang bản mới bằng tiếng Khmer và tiếng Việt tương ứng:
"""
${text}
"""

Yêu cầu phong cách cho bản mới: ${style}
Yêu cầu độ dài cho bản mới: ${length}

BẮT BUỘC kết quả đầu ra khớp chính xác định dạng JSON sau:
{
  "vietnamese": "Nội dung bài viết nhân bản bằng tiếng Việt mới",
  "khmer": "Nội dung bài viết nhân bản bằng tiếng Khmer mới"
}`;
    }
  } else {
    systemInstruction = `Bạn là một chuyên gia phân tích content marketing và Copywriter hàng đầu. Quy trình làm việc của bạn gồm 2 bước bắt buộc:

BƯỚC 1 — PHÂN TÍCH WIN FACTOR:
Hãy phân tích bài content gốc theo các tiêu chí dưới đây và xuất nội dung phân tích đó bằng tiếng Việt vào thuộc tính "winFactor" của JSON:
- hook: Hook Win (Dòng tiêu đề giữ chân): Phân tích câu/cụm từ giữ người đọc ở lại, logic giật tít ở đây là gì? (Đánh vào giá, nỗi đau, hay sự tò mò?)
- emotionalStructure: Angle Win (Góc tiếp cận): Bài viết đang tiếp cận khách hàng theo hướng nào? (Chia sẻ chuyên gia, trải nghiệm thực tế, hay cam kết công năng?)
- trustFactors: Trust Win (Yếu tố tạo niềm tin): Cách bài viết chứng minh chất lượng (Feedback, thẻ bảo hành, hay chứng nhận?)
- cta: CTA Win (Đòn bẩy hành động): Ưu đãi và giới hạn khan hiếm được lồng ghép như thế nào?

BƯỚC 2 — SÁNG TÁC BÀI MỚI GIỮ NGUYÊN KEY WIN:
Bạn BẮT BUỘC phải tạo ra 3 phương án nhân bản song ngữ khác nhau cho bài viết:

YÊU CẦU CHO PHƯƠNG ÁN 1 (Giữ nguyên phom - Đổi Ruột):
- Giữ chính xác 100% cấu trúc, các icon emoji, và khung tâm lý của bài mẫu.
- Chỉ thay đổi các thông số kỹ thuật, tính năng, và tên sản phẩm/thương hiệu sang sản phẩm tương ứng hiện tại của người dùng.
- Mục tiêu là tạo ra bản mới có ngoại quan và nhịp điệu giống hệt bài mẫu, chỉ thay thế thông tin ruột sản phẩm.

YÊU CẦU CHO PHƯƠNG ÁN 2 (Đa dạng hóa Hooks):
- Giữ nguyên phần thân bài và các ưu đãi của bài mẫu.
- Ở phần đầu của cả bản tiếng Việt và tiếng Khmer, bạn phải viết thêm 3 phiên bản tiêu đề/câu hook giật tít khác nhau (được đánh dấu rõ ràng là Hook 1, Hook 2, Hook 3) để người dùng làm ma trận A/B testing tiêu đề.
- Định dạng xuất ra ở phần đầu bài viết:
  [3 PHIÊN BẢN HOOKS A/B TESTING]
  - Hook 1: ...
  - Hook 2: ...
  - Hook 3: ...
  [THÂN BÀI & ƯU ĐÃI]
  (Nội dung thân bài tiếp theo...)

YÊU CẦU CHO PHƯƠNG ÁN 3 (Nâng cấp tối ưu):
- Giữ lại góc tiếp cận cốt lõi (Angle Win) của đối thủ từ bài mẫu.
- Loại bỏ hoàn toàn các từ ngữ rườm rà, lặp ý.
- Bổ sung/tăng cường các hiệu ứng thuyết phục tâm lý mạnh mẽ như sự khan hiếm (FOMO - sợ bỏ lỡ) và hiệu ứng mỏ neo giá (anchor pricing) để tăng sức thuyết phục vượt trội so với bài gốc.

QUY TRÌNH NGÔN NGỮ CHO MỖI PHƯƠNG ÁN:
1. Viết bản tiếng Khmer hoàn chỉnh TRƯỚC (sáng tạo từ đầu theo key win đã phân tích).
2. Dịch sang tiếng Việt từ bản Khmer — trơn tru, tự nhiên, hoàn toàn đồng nhất ý với bản Khmer.

Kết quả trả về định dạng JSON gồm winFactor, option1, option2 và option3.`;

    const frameworkReq = framework && framework !== 'none' ? ` và áp dụng khung cấu trúc ${framework}` : '';

    prompt = `Đây là bài content gốc cần phân tích và nhân bản:

"""
${text}
"""
${style ? `\nYêu cầu phong cách cho bản mới: ${style}` : ''}
${length ? `\nYêu cầu độ dài cho bản mới: ${length}` : ''}
${frameworkReq}

Hãy thực hiện đúng quy trình 2 bước và viết ra 3 phương án nhân bản tương ứng.`;
  }

  try {
    let responseSchema;
    if (replicationMode === true) {
      responseSchema = {
        type: "object",
        properties: {
          winFactor: {
            type: "object",
            properties: {
              hook: { type: "string" },
              emotionalStructure: { type: "string" },
              trustFactors: { type: "string" },
              cta: { type: "string" }
            },
            required: ["hook", "emotionalStructure", "trustFactors", "cta"]
          },
          option1: {
            type: "object",
            properties: {
              vietnamese: { type: "string" },
              khmer: { type: "string" }
            },
            required: ["vietnamese", "khmer"]
          },
          option2: {
            type: "object",
            properties: {
              vietnamese: { type: "string" },
              khmer: { type: "string" }
            },
            required: ["vietnamese", "khmer"]
          },
          option3: {
            type: "object",
            properties: {
              vietnamese: { type: "string" },
              khmer: { type: "string" }
            },
            required: ["vietnamese", "khmer"]
          }
        },
        required: ["winFactor", "option1", "option2", "option3"]
      };
    } else {
      responseSchema = {
        type: "object",
        properties: {
          vietnamese: { type: "string" },
          khmer: { type: "string" }
        },
        required: ["vietnamese", "khmer"]
      };
    }

    let result = await callAI(prompt, systemInstruction, provider, apiKey, model, responseSchema, 0.3);

    if (typeof result === 'string') {
      result = cleanAndParseJSON(result);
    }

    if (replicationMode === true) {
      if (typeof result !== 'object' || result === null || !result.option1) {
        const resultText = typeof result === 'string' ? result : JSON.stringify(result);
        result = {
          winFactor: {
            hook: "Không phân tích được",
            emotionalStructure: "Không phân tích được",
            trustFactors: "Không phân tích được",
            cta: "Không phân tích được"
          },
          option1: { vietnamese: resultText, khmer: "Không thể tự động phân tách JSON. Vui lòng xem bản tiếng Việt." },
          option2: { vietnamese: resultText, khmer: "Không thể tự động phân tách JSON. Vui lòng xem bản tiếng Việt." },
          option3: { vietnamese: resultText, khmer: "Không thể tự động phân tách JSON. Vui lòng xem bản tiếng Việt." }
        };
      }
    } else {
      if (typeof result !== 'object' || result === null || !result.vietnamese) {
        const resultText = typeof result === 'string' ? result : JSON.stringify(result);
        result = {
          vietnamese: resultText,
          khmer: "Không thể tự động phân tách JSON. Vui lòng xem bản tiếng Việt."
        };
      }
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Translation API error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Content Lab Generation Endpoint
app.post('/api/content-lab/generate', async (req, res) => {
  const { text, media, framework, provider, apiKey, model } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Nội dung yêu cầu hoặc mô tả sản phẩm không được để trống' });
  }

  const selectedFramework = framework || 'AIDA';
  let frameworkGuide = '';

  if (selectedFramework === 'AIDA') {
    frameworkGuide = `Khung AIDA:
- Attention: Gây sự chú ý mạnh bằng một tiêu đề giật gân, tò mò (khoảng 3 câu đầu).
- Interest: Tạo sự thích thú bằng cách nói về vấn đề khách hàng đang gặp phải hoặc sự độc đáo của sản phẩm.
- Desire: Kích thích sự khao khát bằng lợi ích, giá trị thực tế hoặc giải pháp mà sản phẩm mang lại.
- Action: Kêu gọi hành động bán hàng quyết liệt (inbox, mua ngay, click link) kèm ưu đãi (nếu có).`;
  } else if (selectedFramework === 'PAS') {
    frameworkGuide = `Khung PAS:
- Problem: Trực tiếp nêu ra vấn đề, nỗi đau, khó khăn lớn nhất mà khách hàng mục tiêu đang chịu đựng.
- Agitate: Xoáy sâu vào nỗi đau đó, mô tả các hệ quả phiền toái nếu không xử lý kịp thời để tăng tính cấp bách.
- Solve: Đưa ra giải pháp giải quyết triệt để nỗi đau bằng cách giới thiệu sản phẩm của bạn.`;
  } else if (selectedFramework === 'FAB') {
    frameworkGuide = `Khung FAB:
- Features: Liệt kê các đặc tính kỹ thuật, thành phần hoặc thông số của sản phẩm.
- Advantages: Nêu rõ các ưu thế, điểm vượt trội của các đặc tính đó so với đối thủ cạnh tranh trên thị trường.
- Benefits: Nhấn mạnh lợi ích thực tế, giá trị thiết thực nhất mà khách hàng nhận được khi sử dụng.`;
  }

  const systemInstruction = `Bạn là một chuyên gia Facebook Content Marketing và Copywriter bậc thầy, chuyên viết bài đăng bán hàng viral trên Facebook. Nhiệm vụ của bạn là phân tích dữ liệu đầu vào (mô tả sản phẩm và/hoặc hình ảnh/video) để viết một bài đăng Facebook đỉnh cao — tối ưu thuật toán Newsfeed, tối ưu tỉ lệ dừng xem (stop-scroll), tăng tương tác tự nhiên và chuyển đổi thành đơn hàng.

Hãy áp dụng bộ khung viết content chuyên nghiệp được chỉ định sau đây:
${frameworkGuide}

=== TIÊU CHUẨN BẮT BUỘC CHO NỘI DUNG FACEBOOK ===

🎯 HOOK (3 dòng đầu - quan trọng nhất):
- Dòng 1: Câu mở đầu PHẢI gây sốc, tò mò, hoặc chạm vào nỗi đau / ước mơ của khách hàng ngay lập tức.
- Dòng 2-3: Khuếch đại cảm xúc — tạo cảm giác "Bài này viết đúng về mình quá!".
- TUYỆT ĐỐI KHÔNG bắt đầu bằng tên sản phẩm hay thương hiệu. Phải bắt đầu bằng cảm xúc, câu hỏi, hoặc sự kiện gây chú ý.
- Sử dụng emoji phù hợp ở đầu dòng để tăng khả năng dừng lướt.

📝 BODY (Thân bài - tuân thủ tuyệt đối Facebook formatting):
- Facebook render text theo từng dòng, KHÔNG dùng bullet "-" mà dùng emoji đầu dòng (✅ 🔥 ⚡ 💎 👉 etc.).
- Mỗi đoạn tối đa 2-3 dòng, sau đó XUỐNG DÒNG TRỐNG (\\n\\n) để tạo khoảng thở.
- Luân phiên giữa đoạn văn kể chuyện và danh sách emoji để giữ nhịp đọc.
- Dùng chữ IN HOA có chọn lọc để nhấn mạnh điểm quan trọng (tối đa 2-3 từ/câu).
- Kể chuyện ngắn hoặc dùng social proof ("Chị Hoa ở Hà Nội vừa phản hồi...") để tăng độ tin cậy.
- Tạo cảm giác khan hiếm hoặc cấp bách nếu phù hợp với sản phẩm.

💬 CTA (Kêu gọi hành động):
- PHẢI cụ thể, rõ ràng: "Inbox ngay", "Comment SĐT", "Nhắn tin ngay để được tư vấn FREE", etc.
- Thêm lý do hành động NGAY (ưu đãi có thời hạn, số lượng giới hạn, quà tặng kèm, etc.).
- Có thể dùng emoji hành động: 📲 💬 👇 📩

#️⃣ HASHTAG:
- Chọn 5-8 hashtag: mix giữa hashtag phổ biến (lượng tìm kiếm cao) và hashtag niche (chính xác ngành).
- Định dạng: #hashtag (không dấu tiếng Việt nếu là từ Việt để tăng reach toàn cầu, ưu tiên dạng liền không dấu).
- Hashtag phải THỰC SỰ liên quan, không spam từ khóa lạc đề.

=== YÊU CẦU PHÂN TÍCH ĐA PHƯƠNG TIỆN ===
1. Nếu đầu vào có Hình ảnh hoặc Video:
   - Nhận diện sản phẩm, màu sắc, chữ/logo trong ảnh (OCR), cảm xúc nhân vật.
   - Với video: mô tả hành động, bối cảnh, thông điệp, lời thoại/phụ đề.
   - Tóm tắt trong trường "analysis".
2. Nếu chỉ có văn bản: đặt "analysis" = "Phân tích sản phẩm dựa trên mô tả văn bản."

BẮT BUỘC kết quả trả về phải khớp chính xác cấu trúc định dạng JSON sau:
{
  "analysis": "Tóm tắt phân tích hình ảnh/video hoặc mô tả sản phẩm...",
  "facebookPost": {
    "hook": "Hook 3 dòng đầu — câu gây sốc/tò mò, emoji, ngắt dòng \\n",
    "body": "Thân bài — đoạn ngắn, emoji đầu dòng, \\n\\n giữa đoạn, social proof, nhấn mạnh IN HOA",
    "cta": "Kêu gọi hành động cụ thể, cấp bách, có emoji hành động",
    "hashtags": "#hashtag1 #hashtag2 #hashtag3 #hashtag4 #hashtag5"
  }
}`;

  const prompt = `Dưới đây là thông tin yêu cầu và mô tả sản phẩm từ người dùng:
"""
${text}
"""

Hãy tiến hành phân tích hình ảnh/video (nếu có đính kèm) và biên soạn bài viết quảng cáo Facebook tối ưu nhất theo khung ${selectedFramework}.`;

  try {
    const responseSchema = {
      type: "object",
      properties: {
        analysis: { type: "string" },
        facebookPost: {
          type: "object",
          properties: {
            hook: { type: "string" },
            body: { type: "string" },
            cta: { type: "string" },
            hashtags: { type: "string" }
          },
          required: ["hook", "body", "cta", "hashtags"]
        }
      },
      required: ["analysis", "facebookPost"]
    };

    let result = await callAI(prompt, systemInstruction, provider, apiKey, model, responseSchema, 0.7, media);

    if (typeof result === 'string') {
      result = cleanAndParseJSON(result);
    }

    if (typeof result !== 'object' || result === null || !result.facebookPost) {
      const resultText = typeof result === 'string' ? result : JSON.stringify(result);
      result = {
        analysis: "Không thể tự động phân tách JSON từ phản hồi của AI.",
        facebookPost: {
          hook: "Chào mừng bạn ghé thăm cửa hàng của chúng tôi!",
          body: resultText,
          cta: "Liên hệ ngay để nhận ưu đãi!",
          hashtags: "#marketing #sales"
        }
      };
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Content Lab API error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Market Intelligence Endpoint (Tình báo thị trường)
app.post('/api/market-intelligence/analyze', async (req, res) => {
  const { product, location, competitor_link, framework,
          provider, apiKey, model, image,
          mode, agentPool } = req.body;

  // ── Xác định agents dùng cho từng bước ────────────────────────
  let agentVision, agentFastText, agentJsonReport;

  if (mode === 'orchestrated' && agentPool) {
    // Chế độ Orchestrator: dùng agentPool từ frontend
    const v = agentPool.vision      || agentPool.fast_text || {};
    const t = agentPool.fast_text   || {};
    const j = agentPool.json_report || agentPool.fast_text || {};
    agentVision      = { provider: v.provider, apiKey: v.nvidiaKey || null, model: v.model,
                          fallback_provider: v.fallback_provider, fallback_model: v.fallback_model, fallback_apiKey: v.fallback_nvidiaKey || null };
    agentFastText    = { provider: t.provider, apiKey: t.nvidiaKey || null, model: t.model,
                          fallback_provider: t.fallback_provider, fallback_model: t.fallback_model, fallback_apiKey: t.fallback_nvidiaKey || null };
    agentJsonReport  = { provider: j.provider, apiKey: j.nvidiaKey || null, model: j.model,
                          fallback_provider: j.fallback_provider, fallback_model: j.fallback_model, fallback_apiKey: j.fallback_nvidiaKey || null };
    console.log(`[Orchestrator] Mode: orchestrated | Vision:${agentVision.provider}/${agentVision.model} | Text:${agentFastText.provider}/${agentFastText.model} | JSON:${agentJsonReport.provider}/${agentJsonReport.model}`);
  } else {
    // Chế độ cũ: single model cho tất cả các bước (backward compatible)
    agentVision = agentFastText = agentJsonReport = { provider, apiKey, model };
  }

  // Hàm gọi AI với fallback tự động (timeout 45s)
  async function callWithFallback(agent, ...callAIArgs) {
    const callWithDeadline = async (operation, timeoutLabel) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      try {
        return await operation(controller.signal);
      } catch (error) {
        if (controller.signal.aborted) throw new Error(timeoutLabel, { cause: error });
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    };

    // Lấy Gemini key: ưu tiên keyManager, fallback process.env
    const getGeminiKey = () =>
      keyManager.getActiveKey('gemini')?.api_key || process.env.GEMINI_API_KEY || null;

    const doCall = (prov, key, mdl, signal) => {
      // Nếu key null và provider là gemini → thử env key trực tiếp
      const resolvedKey = key
        || (prov === 'gemini' ? getGeminiKey()
          : keyManager.getActiveKey(prov)?.api_key);
      if (!resolvedKey) throw new Error(`Không có API key hợp lệ cho ${prov}`);
      return callAI(callAIArgs[0], callAIArgs[1], prov, resolvedKey, mdl, ...callAIArgs.slice(2), signal);
    };

    // Tier 1: Primary agent
    try {
      return await callWithDeadline(
        (signal) => doCall(agent.provider, agent.apiKey, agent.model, signal),
        'agent_timeout',
      );
    } catch (err) {
      console.warn(`[Orchestrator] Primary ${agent.provider}/${agent.model} thất bại (${err.message})`);

      // Tier 2: Declared fallback (từ agent pool config)
      if (agent.fallback_provider && agent.fallback_model) {
        try {
          const fbKey = agent.fallback_provider === 'gemini'
            ? getGeminiKey()
            : (agent.fallback_apiKey || agent.apiKey);
          console.warn(`[Orchestrator] → Thử fallback: ${agent.fallback_provider}/${agent.fallback_model}`);
          return await callWithDeadline(
            (signal) => doCall(agent.fallback_provider, fbKey, agent.fallback_model, signal),
            'fallback_timeout',
          );
        } catch (err2) {
          console.warn(`[Orchestrator] → Fallback ${agent.fallback_provider}/${agent.fallback_model} cũng thất bại (${err2.message})`);
        }
      }

      // Tier 3: Ultimate fallback — Gemini (bỏ qua keyManager rate limit, dùng thẳng raw key đầu tiên hoặc env)
      const ultimateKeys = typeof keyManager !== 'undefined' ? keyManager.getAllKeys('gemini') : [];
      const ultimateKey = process.env.GEMINI_API_KEY || (ultimateKeys.length > 0 ? ultimateKeys[0].api_key : null);
      const ultimateModel = DEFAULT_GEMINI_MODEL;
      if (ultimateKey && (agent.provider !== 'gemini' || agent.model !== ultimateModel)) {
        try {
          console.warn(`[Orchestrator] → Thử ultimate fallback: gemini/${ultimateModel} (env key trực tiếp)`);
          return await callWithDeadline(
            (signal) => callAI(
              callAIArgs[0],
              callAIArgs[1],
              'gemini',
              ultimateKey,
              ultimateModel,
              ...callAIArgs.slice(2),
              signal,
            ),
            'ultimate_timeout',
          );
        } catch (err3) {
          console.warn(`[Orchestrator] → Ultimate fallback thất bại (${err3.message})`);
        }
      }

      // Tất cả đều fail → throw lỗi gốc
      throw err;
    }
  }


  const keyPool = (agentJsonReport.apiKey || apiKey || '')
    .split(/[\s,;\n]+/).filter(Boolean);
  if (keyPool.length === 0 && process.env.GEMINI_API_KEY) {
    keyPool.push(process.env.GEMINI_API_KEY);
  }

  if ((!product || !product.trim()) && !image) {
    return res.status(400).json({ error: 'Vui lòng nhập tên sản phẩm hoặc tải lên hình ảnh để tìm kiếm.' });
  }

  let activeProduct = product ? product.trim() : '';
  let imageAnalysis = null;
  let lensSearchResults = [];

  // Step 1: Image analysis (Vision Agent)
  if (image) {
    try {
      // Orchestrator mode: dùng agentVision; cũ mode: dùng provider gốc
      imageAnalysis = await analyzeImageKeywords(image, async (p, s, schema, t, img) => {
        return await callWithFallback(agentVision, p, s, schema, t, img);
      });
      if (imageAnalysis) {
        if (!activeProduct) {
          activeProduct = imageAnalysis.product_name || '';
        }
        const lensQuery = imageAnalysis.search_query || activeProduct;
        if (lensQuery) {
          console.log(`[Market Intelligence OSINT] Google Lens Simulation - Querying visual matches: ${lensQuery}`);
          lensSearchResults = await searchWeb(lensQuery);
        }
      }
    } catch (err) {
      console.warn(`[Market Intelligence OSINT] Image analysis/search failed:`, err.message);
    }
  }

  // Step 2: Facebook Ads Library search (prioritizing Khmer search query)
  let fbAdsSearchResults = [];
  // Trích tên sản phẩm gọn (trước dấu | hoặc dòng đầu) để làm search term
  const shortProductName = activeProduct
    ? (activeProduct.split('|')[0].replace(/^Tên\s*\/?\s*Link\s*sản phẩm\s*:/i, '').trim().split('\n')[0].trim() || activeProduct)
    : '';
  let adsSearchTerm = shortProductName || activeProduct;

  try {
    let khmerKeyword = '';
    if (imageAnalysis && imageAnalysis.search_query_khmer) {
      khmerKeyword = imageAnalysis.search_query_khmer;
      console.log(`[Market Intelligence OSINT] Found Khmer search query from image analysis: "${khmerKeyword}"`);
    } else if (shortProductName) {
      console.log(`[Market Intelligence OSINT] Translating "${shortProductName}" to Khmer (agent: ${agentFastText.provider}/${agentFastText.model})...`);
      // Dịch tên sản phẩm gọn sang Khmer (không gửi cả mô tả dài)
      khmerKeyword = await translateToKhmerKeyword(shortProductName, async (p, s, schema, t, img) => {
        return await callWithFallback(agentFastText, p, s, schema, t, img);
      });
    }

    if (khmerKeyword) {
      adsSearchTerm = khmerKeyword;
    }
  } catch (err) {
    console.warn(`[Market Intelligence OSINT] Khmer keyword preparation failed, using fallback:`, err.message);
  }


  if (adsSearchTerm) {
    try {
      const fbAdsQuery = `site:facebook.com/ads/library ${adsSearchTerm}`;
      console.log(`[Market Intelligence OSINT] Facebook Ads Library Search (Khmer query) - Querying ads: ${fbAdsQuery}`);
      fbAdsSearchResults = await searchWeb(fbAdsQuery);
    } catch (err) {
      console.warn(`[Market Intelligence OSINT] Facebook Ads Library search failed:`, err.message);
    }
  }

  // Step 3: Crawl competitor/product link if provided
  let crawledContent = '';
  if (competitor_link) {
    try {
      console.log(`[Market Intelligence OSINT] Crawling competitor link: ${competitor_link}`);
      crawledContent = await crawlUrl(competitor_link);
    } catch (err) {
      console.warn(`[Market Intelligence OSINT] Failed to crawl link: ${competitor_link}`, err.message);
      crawledContent = `[Không thể truy cập trực tiếp liên kết của đối thủ. Lỗi: ${err.message}]`;
    }
  }

  // ── Build shared context string (OSINT data) for all frameworks ──
  function buildOsintContext() {
    let ctx = `Thực hiện phân tích chuyên sâu cho:
- Tên sản phẩm / Ngành hàng: ${activeProduct}
- Khu vực thị trường: ${location}
${competitor_link ? `- Đường dẫn đối thủ cần phân tích: ${competitor_link}` : ''}
${crawledContent ? `\nDữ liệu thu thập từ đường dẫn đối thủ:\n"""\n${crawledContent}\n"""` : ''}
`;
    if (imageAnalysis) {
      ctx += `\n📷 THÔNG TIN CHI TIẾT TỪ HÌNH ẢNH SẢN PHẨM:
- Nhận dạng: ${imageAnalysis.product_name}
- Thương hiệu: ${imageAnalysis.brand || 'Không rõ'}
- Đặc điểm trực quan: ${imageAnalysis.visual_description || 'Mô tả trực quan từ ảnh'}
- Từ khóa ảnh: ${imageAnalysis.keywords?.join(', ')}
`;
    }
    if (lensSearchResults && lensSearchResults.length > 0) {
      ctx += `\n🔍 KẾT QUẢ TÌM KIẾM HÌNH ẢNH THỰC TẾ (GOOGLE LENS STYLE):
${lensSearchResults.map((r, i) => `${i+1}. [${r.title}](${r.url})\n   Mô tả: ${r.snippet}`).join('\n')}
`;
    }
    if (fbAdsSearchResults && fbAdsSearchResults.length > 0) {
      ctx += `\n📢 KẾT QUẢ QUÉT FACEBOOK ADS LIBRARY INDEX (từ khóa Khmer: "${adsSearchTerm}"):
${fbAdsSearchResults.map((r, i) => `${i+1}. [${r.title}](${r.url})\n   Nội dung quảng cáo: ${r.snippet}`).join('\n')}
`;
    }
    return ctx;
  }

  // ══════════════════════════════════════════════════════════════
  // FRAMEWORK: full — Full Market Intelligence (logic gốc, giữ nguyên)
  // ══════════════════════════════════════════════════════════════
  async function runFullIntelligence() {
    const systemInstruction = `Bạn là một Giám đốc Tình báo Tiếp thị (Director of Market Intelligence) và Chuyên gia Performance Marketing hàng đầu tại Đông Nam Á, đặc biệt am hiểu sâu sắc thị trường Campuchia.
Nhiệm vụ của bạn là tiến hành phân tích tình báo thị trường toàn diện và chuyên sâu về sản phẩm của người dùng tại thị trường mục tiêu.

Dựa trên thông tin sản phẩm, đặc điểm trực quan từ hình ảnh (nếu có), kết quả tìm kiếm Google Lens và Facebook Ads Library thực tế được cung cấp, bạn phải lập một báo cáo tình báo chi tiết cấu trúc JSON khớp chính xác schema yêu cầu.

1. EXECUTIVE SUMMARY: Tóm tắt 3-4 câu về cục diện thị trường Campuchia: cơ hội lớn nhất, rào cản chính và khuyến nghị chiến lược hành động ngay.
2. COMPETITOR REPORT: price_map_summary, visual_strategy_summary, competitors (>=2), flaws (điểm yếu đối thủ).
3. BUYER PERSONA: phnom_penh_behavior, provincial_behavior, payment_preferences, logistics_barriers, key_concerns, size_recommendations.
4. MARKETING ANGLES: 3-4 góc tiếp cận (angle_name, pain_point, visual_idea, hook_suggestion).
5. FACEBOOK ADS DATA: search_query, activity_level, active_competitors, ad_creative_insights, recommended_ad_angles.

Trả về định dạng JSON duy nhất.`;

    const prompt = buildOsintContext() + `\nHãy lập báo cáo Full Market Intelligence đầy đủ theo JSON schema yêu cầu, phân tích kết quả quét thực tế để trích xuất tên đối thủ, khoảng giá và xu hướng quảng cáo chính xác nhất.`;

    const schema = {
      type: "object",
      properties: {
        executive_summary: { type: "string" },
        competitor_report: {
          type: "object",
          properties: {
            price_map_summary: { type: "string" },
            visual_strategy_summary: { type: "string" },
            competitors: { type: "array", items: { type: "object", properties: { name: { type: "string" }, price_range: { type: "string" }, promotions: { type: "string" }, visual_style: { type: "string" } }, required: ["name","price_range","promotions","visual_style"] } },
            flaws: { type: "array", items: { type: "object", properties: { issue: { type: "string" }, evidence: { type: "string" }, opportunity: { type: "string" } }, required: ["issue","evidence","opportunity"] } }
          },
          required: ["price_map_summary","visual_strategy_summary","competitors","flaws"]
        },
        buyer_persona: {
          type: "object",
          properties: {
            phnom_penh_behavior: { type: "string" },
            provincial_behavior: { type: "string" },
            payment_preferences: { type: "string" },
            logistics_barriers: { type: "array", items: { type: "string" } },
            key_concerns: { type: "array", items: { type: "string" } },
            size_recommendations: { type: "string" }
          },
          required: ["phnom_penh_behavior","provincial_behavior","payment_preferences","logistics_barriers","key_concerns","size_recommendations"]
        },
        marketing_angles: { type: "array", items: { type: "object", properties: { angle_name: { type: "string" }, pain_point: { type: "string" }, visual_idea: { type: "string" }, hook_suggestion: { type: "string" } }, required: ["angle_name","pain_point","visual_idea","hook_suggestion"] } },
        facebook_ads_data: {
          type: "object",
          properties: {
            search_query: { type: "string" },
            activity_level: { type: "string" },
            active_competitors: { type: "array", items: { type: "string" } },
            ad_creative_insights: { type: "string" },
            recommended_ad_angles: { type: "array", items: { type: "string" } }
          },
          required: ["search_query","activity_level","active_competitors","ad_creative_insights","recommended_ad_angles"]
        }
      },
      required: ["executive_summary","competitor_report","buyer_persona","marketing_angles","facebook_ads_data"]
    };

    const result = await callWithFallback(agentJsonReport, prompt, systemInstruction, schema, 0.6, image);
    let parsed = typeof result === 'string' ? cleanAndParseJSON(result) : result;
    if (parsed?.facebook_ads_data) parsed.facebook_ads_data.search_query = adsSearchTerm;
    return parsed;
  }

  // ══════════════════════════════════════════════════════════════
  // FRAMEWORK: first_principles — Product Feature Analytics
  // ══════════════════════════════════════════════════════════════
  async function runProductFeatureAnalysis() {
    const systemInstruction = `Bạn là một Giám đốc Sản phẩm (Product Director) xuất sắc với 10 năm kinh nghiệm trong việc tối ưu hóa sản phẩm và phân tích cạnh tranh tại thị trường Đông Nam Á, đặc biệt là Campuchia.

Nhiệm vụ: Thực hiện "Product Feature Analytics" chuyên sâu cho sản phẩm được cung cấp. Logic phân tích đi từ Định tính (Tính năng là gì?) → Định lượng (Hiệu suất ra sao?) → Chiến lược (Cạnh tranh thế nào?).

Hãy phân tích theo 4 bước chuẩn chuyên gia:

1. EXECUTIVE SUMMARY: 3-4 câu tóm tắt vũ khí cạnh tranh nổi bật nhất và lỗ hổng cần bù đắp khẩn cấp.

2. FEATURE DECONSTRUCTION — Phân rã tính năng:
   - core_features: Tính năng cốt lõi (Core) — chức năng chính, không thể thiếu.
   - supporting_features: Tính năng bổ trợ (Supporting) — hỗ trợ trải nghiệm.
   - usp_features: Tính năng tạo khác biệt/USP (Delighters) — điểm độc bản.
   Mỗi tính năng: name, description (mô tả chi tiết cách hoạt động), score (1-10 về độ mượt/hiệu suất).

3. STRENGTHS & WEAKNESSES — Phân tích kỹ thuật:
   - strengths: Tính năng nào vận hành xuất sắc nhất (tiện lợi, tốc độ, thẩm mỹ)?
   - weaknesses: Điểm nghẽn, lỗi trải nghiệm, khoảng trống tính năng mà đối thủ đã làm tốt hơn.

4. VALUE MATRIX — Ma trận Giá trị vs Độ phức tạp:
   - quick_wins: Giá trị cao, dễ làm → đẩy mạnh ngay.
   - major_projects: Giá trị cao, khó làm → lên kế hoạch dài hạn.
   - fill_ins: Giá trị thấp, dễ làm → làm khi rảnh rỗi.
   - thankless_tasks: Giá trị thấp, khó làm → cân nhắc loại bỏ.

5. ROADMAP RECOMMENDATIONS — Khuyến nghị hành động:
   - keep_optimize: Tính năng cần Giữ nguyên hoặc Tối ưu thêm.
   - remove_reduce: Tính năng cần Loại bỏ/Bỏ bớt chi tiết thừa.
   - add_urgently: Tính năng cần Thêm mới khẩn cấp để bắt kịp đối thủ.

6. COMPETITIVE BENCHMARK — Đối sánh cạnh tranh:
   So sánh tính năng của sản phẩm với đối thủ trực tiếp tại Campuchia: đâu đang "Đi trước", "Bằng vai", hay "Tụt hậu".

Trả về định dạng JSON duy nhất.`;

    const prompt = buildOsintContext() + `\nDựa trên thông tin sản phẩm và dữ liệu thị trường thực tế trên, hãy thực hiện Product Feature Analytics đầy đủ theo JSON schema yêu cầu. Phân tích cụ thể, thực tiễn, có ví dụ rõ ràng.`;

    const schema = {
      type: "object",
      properties: {
        executive_summary: { type: "string" },
        feature_deconstruction: {
          type: "object",
          properties: {
            core_features: { type: "array", items: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, score: { type: "number" } }, required: ["name","description","score"] } },
            supporting_features: { type: "array", items: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, score: { type: "number" } }, required: ["name","description","score"] } },
            usp_features: { type: "array", items: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, score: { type: "number" } }, required: ["name","description","score"] } }
          },
          required: ["core_features","supporting_features","usp_features"]
        },
        strengths_weaknesses: {
          type: "object",
          properties: {
            strengths: { type: "array", items: { type: "object", properties: { feature: { type: "string" }, reason: { type: "string" } }, required: ["feature","reason"] } },
            weaknesses: { type: "array", items: { type: "object", properties: { feature: { type: "string" }, issue: { type: "string" }, competitor_gap: { type: "string" } }, required: ["feature","issue","competitor_gap"] } }
          },
          required: ["strengths","weaknesses"]
        },
        value_matrix: {
          type: "object",
          properties: {
            quick_wins: { type: "array", items: { type: "object", properties: { feature: { type: "string" }, why: { type: "string" } }, required: ["feature","why"] } },
            major_projects: { type: "array", items: { type: "object", properties: { feature: { type: "string" }, why: { type: "string" } }, required: ["feature","why"] } },
            fill_ins: { type: "array", items: { type: "object", properties: { feature: { type: "string" }, why: { type: "string" } }, required: ["feature","why"] } },
            thankless_tasks: { type: "array", items: { type: "object", properties: { feature: { type: "string" }, why: { type: "string" } }, required: ["feature","why"] } }
          },
          required: ["quick_wins","major_projects","fill_ins","thankless_tasks"]
        },
        roadmap_recommendations: {
          type: "object",
          properties: {
            keep_optimize: { type: "array", items: { type: "object", properties: { feature: { type: "string" }, action: { type: "string" } }, required: ["feature","action"] } },
            remove_reduce: { type: "array", items: { type: "object", properties: { feature: { type: "string" }, reason: { type: "string" } }, required: ["feature","reason"] } },
            add_urgently: { type: "array", items: { type: "object", properties: { feature: { type: "string" }, reason: { type: "string" } }, required: ["feature","reason"] } }
          },
          required: ["keep_optimize","remove_reduce","add_urgently"]
        },
        competitive_benchmark: {
          type: "array",
          items: {
            type: "object",
            properties: {
              competitor: { type: "string" },
              ahead_of_us: { type: "string" },
              on_par: { type: "string" },
              we_lead: { type: "string" }
            },
            required: ["competitor","ahead_of_us","on_par","we_lead"]
          }
        }
      },
      required: ["executive_summary","feature_deconstruction","strengths_weaknesses","value_matrix","roadmap_recommendations","competitive_benchmark"]
    };

    const result = await callWithFallback(agentJsonReport, prompt, systemInstruction, schema, 0.7, image);
    return typeof result === 'string' ? cleanAndParseJSON(result) : result;
  }

  // ══════════════════════════════════════════════════════════════
  // FRAMEWORK: pain_point — Customer Insight Analytics
  // ══════════════════════════════════════════════════════════════
  async function runCustomerInsightAnalysis() {
    const systemInstruction = `Bạn là một Chuyên gia Nghiên cứu Hành vi Khách hàng (Consumer Insight Director) và Giám đốc Chiến lược Marketing kỳ cựu với chuyên môn sâu về thị trường Campuchia.

Nhiệm vụ: Thực hiện "Customer Insight Analytics" chuyên sâu nhằm khai thác nỗi đau và điểm chạm cho sản phẩm. Logic dựa trên mô hình Thấu cảm (Empathy): Chân dung → Nỗi đau (Pain Points) → Kỳ vọng (Gains) → Bản đồ hành trình (Customer Journey).

Hãy phân tích theo 4 bước chuẩn chuyên gia:

1. EXECUTIVE SUMMARY: 3-4 câu tóm tắt insight cốt lõi, lý do khách hàng mua hoặc từ chối mua, và thông điệp đột phá cần truyền đi.

2. EMPATHY PERSONA MATRIX — Chân dung Thấu cảm:
   Khắc họa 1-2 nhóm khách hàng mục tiêu tiêu biểu. Ngoài nhân khẩu học, tập trung vào: thói quen hằng ngày, hành vi trên môi trường số, và động lực ngầm hiểu thúc đẩy ra quyết định.

3. PAIN POINTS & GAINS — Nỗi đau & Kỳ vọng:
   Phân chia nỗi đau thành 4 tầng: Tài chính (lãng phí tiền), Năng suất (mất thời gian), Quá trình (bất tiện), Cảm xúc (lo lắng, thiếu an tâm).
   Kỳ vọng: Mong muốn tối thượng cả lý tính lẫn cảm tính.

4. TOUCHPOINT JOURNEY MAPPING — Bản đồ Điểm chạm:
   Phân tích 3 giai đoạn: Trước khi mua, Trong khi mua, Sau khi mua.
   Xác định "Điểm chạm nóng" (Hot Touchpoints) — nơi dễ ra quyết định hoặc từ bỏ nhất.
   temperature: "hot" (hài lòng/mua) | "cold" (ức chế/rời đi) | "warm" (trung tính).

5. GOLDEN INSIGHT & MESSAGING — Insight Vàng & Thông điệp:
   Insight "Vàng" theo công thức: "Khách hàng muốn [Hành động]... NHƯNG họ gặp khó khăn vì [Nỗi đau]... VÌ VẬY họ thực sự khao khát [Sự thật ngầm hiểu]".
   Đề xuất 3-4 góc tiếp cận truyền thông (angles) đánh trúng tâm lý này.

Trả về định dạng JSON duy nhất.`;

    const prompt = buildOsintContext() + `\nDựa trên thông tin sản phẩm và dữ liệu thị trường thực tế trên, hãy thực hiện Customer Insight Analytics đầy đủ theo JSON schema yêu cầu. Phân tích sâu tâm lý, cụ thể và thực tiễn với người mua tại Campuchia.`;

    const schema = {
      type: "object",
      properties: {
        executive_summary: { type: "string" },
        empathy_personas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              persona_name: { type: "string" },
              demographics: { type: "string" },
              daily_habits: { type: "string" },
              digital_behavior: { type: "string" },
              hidden_motive: { type: "string" }
            },
            required: ["persona_name","demographics","daily_habits","digital_behavior","hidden_motive"]
          }
        },
        pain_gains: {
          type: "object",
          properties: {
            pain_financial: { type: "string" },
            pain_productivity: { type: "string" },
            pain_process: { type: "string" },
            pain_emotional: { type: "string" },
            gains_rational: { type: "string" },
            gains_emotional: { type: "string" }
          },
          required: ["pain_financial","pain_productivity","pain_process","pain_emotional","gains_rational","gains_emotional"]
        },
        touchpoint_journey: {
          type: "object",
          properties: {
            pre_purchase: { type: "array", items: { type: "object", properties: { touchpoint: { type: "string" }, emotion: { type: "string" }, temperature: { type: "string" } }, required: ["touchpoint","emotion","temperature"] } },
            during_purchase: { type: "array", items: { type: "object", properties: { touchpoint: { type: "string" }, emotion: { type: "string" }, temperature: { type: "string" } }, required: ["touchpoint","emotion","temperature"] } },
            post_purchase: { type: "array", items: { type: "object", properties: { touchpoint: { type: "string" }, emotion: { type: "string" }, temperature: { type: "string" } }, required: ["touchpoint","emotion","temperature"] } },
            hot_touchpoints: { type: "array", items: { type: "string" } }
          },
          required: ["pre_purchase","during_purchase","post_purchase","hot_touchpoints"]
        },
        golden_insight: {
          type: "object",
          properties: {
            insight_statement: { type: "string" },
            formula_want: { type: "string" },
            formula_barrier: { type: "string" },
            formula_truth: { type: "string" }
          },
          required: ["insight_statement","formula_want","formula_barrier","formula_truth"]
        },
        messaging_angles: {
          type: "array",
          items: {
            type: "object",
            properties: {
              angle_name: { type: "string" },
              psychology_trigger: { type: "string" },
              message: { type: "string" },
              content_scenario: { type: "string" }
            },
            required: ["angle_name","psychology_trigger","message","content_scenario"]
          }
        }
      },
      required: ["executive_summary","empathy_personas","pain_gains","touchpoint_journey","golden_insight","messaging_angles"]
    };

    const result = await callWithFallback(agentJsonReport, prompt, systemInstruction, schema, 0.7, image);
    return typeof result === 'string' ? cleanAndParseJSON(result) : result;
  }

  // ── Route theo framework ──────────────────────────────────────
  try {
    let parsedResult;
    if (framework === 'first_principles') {
      console.log('[Market Intelligence] Running Product Feature Analytics...');
      parsedResult = await runProductFeatureAnalysis();
    } else if (framework === 'pain_point') {
      console.log('[Market Intelligence] Running Customer Insight Analytics...');
      parsedResult = await runCustomerInsightAnalysis();
    } else {
      console.log('[Market Intelligence] Running Full Market Intelligence...');
      parsedResult = await runFullIntelligence();
    }
    res.json({ success: true, data: parsedResult, framework });
  } catch (error) {
    console.error('Market Intelligence API error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- VIDEO DUBBING ENDPOINTS ---

const uploadsDir = process.env.USER_DATA_PATH 
  ? path.join(process.env.USER_DATA_PATH, 'uploads')
  : path.join(workspaceRoot, 'runtime', 'uploads');

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

function removeFileIfExists(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.warn(`[Cleanup] Could not remove ${filePath}: ${error.message}`);
  }
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}


function formatSRTTime(seconds) {
  const hh = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const mm = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const ss = Math.floor(seconds % 60).toString().padStart(2, '0');
  const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
  return `${hh}:${mm}:${ss},${ms}`;
}

// Serve uploads directory statically for preview
app.get("/downloads/:filename", (req, res, next) => {
  const filename = req.params.filename;
  let filePath;
  try {
    filePath = resolveWithinDirectory(uploadsDir, filename);
  } catch {
    return res.status(400).send("Invalid filename");
  }
  
  console.log(`Preview request for: ${filename}, path: ${filePath}`);
  
  if (fs.existsSync(filePath)) {
    if (filename.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    }
    res.sendFile(filePath, (err) => {
      if (err) {
        if (res.headersSent) return;
        if (err.status === 416) {
          return res.status(416).end();
        }
        next(err);
      }
    });
  } else {
    res.status(404).send("Video không tồn tại");
  }
});

// Force attachment download of dubbed video
app.get("/api/download/:filename", (req, res) => {
  const filename = req.params.filename;
  let filePath;
  try {
    filePath = resolveWithinDirectory(uploadsDir, filename);
  } catch {
    return res.status(400).json({ error: "Invalid filename" });
  }
  
  if (fs.existsSync(filePath)) {
    res.download(filePath, "video_long_tieng.mp4", (err) => {
      if (err) {
        console.error("Download error:", err);
      }
    });
  } else {
    res.status(404).json({ error: "Không tìm thấy file trên hệ thống" });
  }
});

// Upload video file
app.post("/api/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  res.json({ filename: req.file.filename, originalName: req.file.originalname });
});

// Extract audio from video
app.post("/api/extract-audio", async (req, res) => {
  const { filename } = req.body;
  let inputPath;
  let outputPath;
  try {
    inputPath = resolveWithinDirectory(uploadsDir, filename);
    outputPath = resolveWithinDirectory(uploadsDir, `${filename}.${Date.now()}-${Math.random().toString(16).slice(2)}.mp3`);
  } catch {
    return res.status(400).json({ error: "Invalid filename" });
  }

  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ error: "Video not found" });
  }

  ffmpeg(inputPath)
    .toFormat("mp3")
    .on("end", () => {
      try {
        const audioBase64 = fs.readFileSync(outputPath, { encoding: "base64" });
        res.json({ audio: audioBase64 });
      } finally {
        removeFileIfExists(outputPath);
      }
    })
    .on("error", (err) => {
      console.error("FFmpeg error:", err);
      removeFileIfExists(outputPath);
      res.status(500).json({ error: "Lỗi ffmpeg: " + err.message });
    })
    .save(outputPath);
});

// Edge TTS API Call (Miễn phí, chất lượng cao)
async function generateEdgeTTS(text, voiceName) {
  const tempDir = path.join(uploadsDir, `edge_${Date.now()}_${Math.floor(Math.random() * 10000)}`);
  fs.mkdirSync(tempDir, { recursive: true });
  let tts;
  try {
    console.log(`[Edge TTS] Đang tạo giọng đọc với voice: ${voiceName}...`);
    tts = new MsEdgeTTS();
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const result = await tts.toFile(tempDir, text);
    const audioFilePath = result && result.audioFilePath ? result.audioFilePath : path.join(tempDir, 'audio.mp3');
    const mp3Buffer = fs.readFileSync(audioFilePath);
    return mp3Buffer.toString('base64');
  } catch (error) {
    console.error(`[Edge TTS] Lỗi:`, error);
    throw new Error(`Lỗi Edge TTS: ${error.message}`, { cause: error });
  } finally {
    try {
      if (tts && typeof tts.close === 'function') {
        tts.close();
      }
    } catch (_) {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

// Gemini TTS API Call
async function callGeminiTTS(text, voiceName, targetLanguage, ignoredApiKey) {
  // Các model hỗ trợ trả về AUDIO Modality
  const models = [
    'gemini-3.1-flash-tts-preview',
    'gemini-2.5-flash-preview-tts'
  ];

  const prompt = `Bạn là một chuyên gia lồng tiếng chuyên nghiệp người bản xứ ${targetLanguage}. 
Hãy đọc đoạn văn bản sau đây một cách tự nhiên, giàu cảm xúc, có nhịp điệu và nhấn nhá chuẩn xác như người bản địa. 
Yêu cầu: Giọng đọc phải truyền cảm, phù hợp với ngữ cảnh, diễn cảm tốt và tuyệt đối không được máy móc.

Nội dung cần lồng tiếng:
${text}`;

  return await keyManager.runWithKeyRotation('gemini', async (key) => {
    let lastError = null;
    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const payload = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceName }
              }
            }
          }
        };

        const response = await axios.post(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key
          },
          timeout: 35000
        });

        const parts = response.data?.candidates?.[0]?.content?.parts || [];
        let audioData = null;
        for (const p of parts) {
          if (p.inlineData && p.inlineData.data) {
            audioData = p.inlineData.data;
            break;
          }
        }
        
        if (audioData) return audioData;
        
        console.error(`[Gemini TTS] Không có audio data trong response của model ${model}:`, JSON.stringify(response.data, null, 2));
        throw new Error('Không có audio data trả về.');
      } catch (error) {
        const status = error.response?.status;
        if ([401, 403, 429, 502, 503, 504].includes(status) || error.code === 'ECONNABORTED') {
          throw error; // Ném ra để KeyManager tự động xoay key hoặc phạt
        }
        console.warn(`[Gemini TTS] Model ${model} failed. Trying next model...`, error.message);
        lastError = error;
      }
    }
    throw lastError || new Error(`Tất cả model Gemini đều thất bại khi tạo TTS.`);
  });
}

const OPENAI_TTS_VOICES = ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"];

async function callOpenAITTS(text, voiceName) {
  return await keyManager.runWithKeyRotation('openai', async (key) => {
    const url = 'https://api.openai.com/v1/audio/speech';
    const payload = {
      model: 'tts-1',
      voice: voiceName,
      input: text,
      response_format: 'mp3'
    };

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      responseType: 'arraybuffer',
      timeout: 60000
    });

    return Buffer.from(response.data).toString('base64');
  });
}

// Proxy routes for Gemini API in Dubbing
app.post("/api/dubbing/transcribe", async (req, res) => {
  const { audioBase64, provider, apiKey, model, geminiApiKey } = req.body;
  if (!audioBase64) {
    return res.status(400).json({ error: "Thiếu dữ liệu âm thanh" });
  }

  const prompt = "Hãy trích xuất TOÀN BỘ nội dung nói từ âm thanh này, bao gồm cả lời thoại nhân vật, lời bình (narration), lời dẫn chuyện và bất kỳ tiếng nói nào khác. Đảm bảo không bỏ sót bất kỳ đoạn nội dung nói nào. Cung cấp mốc thời gian bắt đầu (start) và kết thúc (end) chính xác cho từng câu hoặc đoạn nội dung. Trả về một mảng JSON gồm các đối tượng có thuộc tính 'start', 'end' và 'text'. Mốc thời gian tính bằng giây (số thực).";
  const systemInstruction = "Bạn là một AI trích xuất phụ đề video chuyên nghiệp. Bạn phải trả về một mảng JSON chính xác.";
  
  const responseSchema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        start: { type: "number" },
        end: { type: "number" },
        text: { type: "string" }
      },
      required: ["start", "end", "text"]
    }
  };

  try {
    const audioDataUri = `data:audio/mp3;base64,${audioBase64}`;
    const finalApiKey = geminiApiKey || (provider === 'gemini' ? apiKey : '') || process.env.GEMINI_API_KEY;
    const transcribeModel = (model && model.toLowerCase().includes('gemini')) ? model : DEFAULT_GEMINI_MODEL;
    const result = await callGemini(
      prompt,
      systemInstruction,
      finalApiKey,
      transcribeModel,
      responseSchema,
      0.2,
      undefined,
      audioDataUri
    );
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Transcribe API error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/dubbing/translate", async (req, res) => {
  const { segments, targetLanguage, provider, apiKey, model } = req.body;
  if (!segments || !Array.isArray(segments)) {
    return res.status(400).json({ error: "Thiếu dữ liệu đoạn hội thoại cần dịch" });
  }

  const prompt = `Hãy dịch TOÀN BỘ nội dung nói sau đây (bao gồm lời thoại, lời bình, lời dẫn chuyện) sang tiếng ${targetLanguage}. 
QUAN TRỌNG: 
1. Không được bỏ sót bất kỳ đoạn nội dung nào.
2. Nội dung dịch phải ngắn gọn súc tích để có thể đọc kịp trong khoảng thời gian gốc (end - start).
3. Giữ nguyên ngữ nghĩa và sắc thái của bản gốc.
Trả về cùng cấu trúc mảng JSON nhưng có thêm trường 'translatedText'.

Dữ liệu cần dịch:
${JSON.stringify(segments)}`;

  const systemInstruction = "Bạn là một chuyên gia dịch thuật video chuyên nghiệp. Dịch sát nghĩa, ngắn gọn, tự nhiên.";
  const responseSchema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        start: { type: "number" },
        end: { type: "number" },
        text: { type: "string" },
        translatedText: { type: "string" }
      },
      required: ["start", "end", "text", "translatedText"]
    }
  };

  try {
    const result = await callAI(
      prompt,
      systemInstruction,
      provider,
      apiKey,
      model || DEFAULT_GEMINI_MODEL,
      responseSchema,
      0.3
    );
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Translate segments API error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/dubbing/speech", async (req, res) => {
  const { text, voiceName, targetLanguage, apiKey } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Thiếu nội dung cần lồng tiếng" });
  }

  try {
    let audioBase64;
    const v = voiceName || "Kore";
    if (v.startsWith('clone:') || ['adam', 'doantrang'].includes(v) || v.startsWith('vnev3_')) {
      return res.status(400).json({ 
        success: false, 
        error: "Giọng Clone và VieNeu-TTS chạy trực tiếp qua Engine của Omnira Studio. Hãy tắt và mở lại ứng dụng Omnira Studio để nạp kênh âm thanh mới." 
      });
    }
    if (v.includes('Neural')) {
      audioBase64 = await generateEdgeTTS(text, v);
    } else if (OPENAI_TTS_VOICES.includes(v.toLowerCase())) {
      audioBase64 = await callOpenAITTS(text, v.toLowerCase());
    } else {
      audioBase64 = await callGeminiTTS(text, v, targetLanguage || "Tiếng Việt", apiKey);
    }
    res.json({ success: true, data: audioBase64 });
  } catch (error) {
    console.error("Speech generation API error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

function extractAudioForSeparation(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('pcm_s16le')
      .audioChannels(2)
      .audioFrequency(44100)
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });
}

function cleanupMergeTemporaryFiles({ audioPath, srtPath, separationDirectory }) {
  for (const temporaryPath of [audioPath, srtPath]) {
    if (temporaryPath && fs.existsSync(temporaryPath)) {
      try { fs.unlinkSync(temporaryPath); } catch (error) {
        console.warn(`Không thể xóa file tạm ${temporaryPath}:`, error.message);
      }
    }
  }

  if (separationDirectory && fs.existsSync(separationDirectory)) {
    try { fs.rmSync(separationDirectory, { recursive: true, force: true }); } catch (error) {
      console.warn(`Không thể xóa thư mục stem tạm ${separationDirectory}:`, error.message);
    }
  }
}

// Merging endpoint (copied and adapted from server.ts)
app.post("/api/merge", async (req, res) => {
  const { videoFilename, audioBase64, videoQuality, audioMode, includeSubtitles, maskOriginalSubtitles, subtitleBox, transcript } = req.body;
  
  if (!audioBase64) {
    return res.status(400).json({ error: "No audio data provided" });
  }

  let selectedAudioMode;
  try {
    selectedAudioMode = normalizeAudioMode(audioMode);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  let demucsRuntime;
  if (selectedAudioMode === 'keep_fx') {
    try {
      demucsRuntime = await getVerifiedDemucsRuntime();
    } catch (error) {
      console.error('Audio engine preflight error:', error);
      return res.status(503).json({ error: error.message });
    }
  }

  let videoPath;
  let srtPath;
  let outputPath;
  try {
    videoPath = resolveWithinDirectory(uploadsDir, videoFilename);
    srtPath = resolveWithinDirectory(uploadsDir, `${videoFilename}.srt`);
    outputPath = resolveWithinDirectory(uploadsDir, `${videoFilename}_final.mp4`);
  } catch {
    return res.status(400).json({ error: "Invalid video filename" });
  }

  if (!fs.existsSync(videoPath)) {
    return res.status(404).json({ error: "Không tìm thấy video gốc trên server" });
  }

  try {
    const {
      buffer: audioBuffer,
      extension: audioExtension,
      isRawPcm,
    } = decodeAudioBase64Payload(audioBase64);
    const audioPath = path.join(uploadsDir, `${videoFilename}_dubbed${audioExtension}`);

    fs.writeFileSync(audioPath, audioBuffer);

    // Generate SRT if requested
    if (includeSubtitles && transcript && Array.isArray(transcript)) {
      const srtContent = transcript.map((s, i) => {
        const start = formatSRTTime(s.start);
        const end = formatSRTTime(s.end);
        const text = (s.translatedText || s.text).replace(/\n/g, ' ');
        return `${i + 1}\n${start} --> ${end}\n${text}\n`;
      }).join('\n');
      fs.writeFileSync(srtPath, srtContent, 'utf8');
    }

    const stats = fs.statSync(audioPath);
    if (stats.size === 0) {
      throw new Error("Dữ liệu âm thanh tạo ra bị trống");
    }

    // Get video duration and metadata
    ffmpeg.ffprobe(videoPath, async (err, metadata) => {
      if (err) {
        console.error("Probe error:", err);
        cleanupMergeTemporaryFiles({ audioPath, srtPath });
        return res.status(500).json({ error: "Không thể phân tích video" });
      }

      const videoDuration = metadata.format.duration || 0;
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
      const hasAudio = !!audioStream;
      let separationDirectory;

      try {

      // Calculate audio duration dynamically
      let audioDuration = 0;
      if (!isRawPcm) {
        audioDuration = await new Promise((resolve) => {
          ffmpeg.ffprobe(audioPath, (probeErr, meta) => {
            if (probeErr) console.warn('Dubbed audio ffprobe warning:', probeErr.message);
            resolve(meta?.format?.duration || 0);
          });
        });
      } else {
        // Fallback for raw PCM (Gemini TTS: 24000Hz, 16-bit, Mono)
        audioDuration = stats.size / (24000 * 2 * 1);
      }

      const tempo = computeDubbingTempo(audioDuration, videoDuration);

      console.log(`Video: ${videoDuration}s, Audio (${audioExtension}): ${audioDuration}s, Target Tempo: ${tempo.toFixed(3)}, Quality: ${videoQuality}, Mode: ${selectedAudioMode}`);

      let accompanimentPath;
      if (hasAudio && selectedAudioMode === 'keep_fx') {
        separationDirectory = fs.mkdtempSync(path.join(uploadsDir, 'dubmaster-stems-'));
        const extractedAudioPath = path.join(separationDirectory, 'original.wav');
        await extractAudioForSeparation(videoPath, extractedAudioPath);
        accompanimentPath = await separateNoVocalsStem({
          inputPath: extractedAudioPath,
          outputDir: path.join(separationDirectory, 'separated'),
          pythonPath: demucsRuntime.pythonPath,
          processEnv: demucsRuntime.processEnv,
        });
      }

      const effectiveAudioMode = hasAudio ? selectedAudioMode : 'mute';
      const { filters, audioMap } = buildDubbedAudioFilters({
        tempo,
        audioMode: effectiveAudioMode,
        accompanimentInput: accompanimentPath ? '2:a' : undefined,
        videoDuration,
      });

      let videoMap = "0:v:0";
      if (videoQuality && videoQuality !== "original") {
        const height = videoQuality === "1080p" ? 1080 : videoQuality === "720p" ? 720 : 480;
        filters.push({
          filter: "scale",
          options: `-2:${height}`,
          inputs: "0:v:0",
          outputs: "v_scaled"
        });
        videoMap = "v_scaled";
      }

      if (includeSubtitles && fs.existsSync(srtPath)) {
        let subtitleInput = videoMap === "0:v:0" ? "0:v:0" : videoMap;
        
        if (maskOriginalSubtitles) {
          let maskY = "ih-ih/4.5"; 
          let maskH = "ih/4.5";
          
          if (subtitleBox && typeof subtitleBox.y === 'number' && typeof subtitleBox.height === 'number') {
            const yNorm = subtitleBox.y / 1000;
            const hNorm = subtitleBox.height / 1000;
            maskY = `ih*${Math.max(0, yNorm - 0.04).toFixed(3)}`; 
            maskH = `ih*${Math.min(1, hNorm + 0.08).toFixed(3)}`; 
          }

          filters.push({
            filter: "drawbox",
            options: `y=${maskY}:color=black@0.9:width=iw:height=${maskH}:t=fill`,
            inputs: subtitleInput,
            outputs: "v_masked"
          });
          subtitleInput = "v_masked";
        }

        const escapedSrtPath = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
        let marginV = 25;

        filters.push({
          filter: "subtitles",
          options: `filename='${escapedSrtPath}':force_style='FontName=DejaVu Sans,FontSize=13,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=3,Outline=0,Shadow=0,Alignment=2,MarginV=${marginV},Spacing=0.5'`,
          inputs: subtitleInput,
          outputs: "v_subbed"
        });
        
        videoMap = "v_subbed";
      }

      const finalVideoMap = videoMap === "0:v:0" ? "0:v:0" : `[${videoMap}]`;

      const audioInputOptions = isRawPcm ? [
        "-f s16le",
        "-ar 24000",
        "-ac 1"
      ] : [];

      const mergeCommand = ffmpeg(videoPath)
        .input(audioPath)
        .inputOptions(audioInputOptions);

      if (accompanimentPath) {
        mergeCommand.input(accompanimentPath);
      }

      mergeCommand
        .complexFilter(filters)
        .outputOptions([
          `-map ${finalVideoMap}`,
          `-map ${audioMap}`,
          "-c:v libx264",
          "-preset fast",
          "-crf 23",
          "-pix_fmt yuv420p",
          "-c:a aac",
          "-b:a 128k",
          "-movflags +faststart"
        ])
        .on("start", (cmd) => console.log("FFmpeg started:", cmd))
        .on("end", () => {
          const finalPath = path.join(uploadsDir, `${videoFilename}_final.mp4`);
          if (fs.existsSync(finalPath)) {
            const stats = fs.statSync(finalPath);
            console.log(`Merge completed successfully. Final file size: ${stats.size} bytes`);
            res.json({
              success: true,
              url: buildFreshDownloadUrl(`${videoFilename}_final.mp4`),
            });
          } else {
            console.error(`Merge reported success but file not found at ${finalPath}`);
            res.status(500).json({ error: "Lỗi hệ thống: Không tìm thấy file sau khi ghép" });
          }
          
          cleanupMergeTemporaryFiles({ audioPath, srtPath, separationDirectory });
        })
        .on("error", (err) => {
          console.error("Merge error:", err);
          cleanupMergeTemporaryFiles({ audioPath, srtPath, separationDirectory });
          res.status(500).json({ error: `Lỗi ghép Video: ${err.message}` });
        })
        .save(outputPath);
      } catch (error) {
        console.error('Audio separation error:', error);
        cleanupMergeTemporaryFiles({ audioPath, srtPath, separationDirectory });
        return res.status(500).json({ error: error.message });
      }
    });
  } catch (err) {
    console.error("Preparation error:", err);
    res.status(500).json({ error: err.message });
  }
});


// ============================================================
// VIDEO LOGO / WATERMARK ENDPOINT
// ============================================================

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `logo_${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh (PNG, JPG, WebP).'), false);
  },
});

/**
 * POST /api/video/add-logo
 * Body (multipart/form-data):
 *   logo       - file ảnh PNG/JPG/WebP
 *   videoFilename - tên file video trong uploadsDir (VD: abc123_final.mp4)
 *   position   - 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
 *   scale      - số thực 0.05 → 0.5 (tỷ lệ chiều rộng logo so với video)
 *   opacity    - số thực 0.1 → 1.0
 * Returns: { success: true, url: '/downloads/<filename>_logo.mp4' }
 */
app.post('/api/video/add-logo', logoUpload.single('logo'), async (req, res) => {
  const logoPath = req.file?.path;

  try {
    const {
      videoFilename,
      position = 'bottom-right',
      scale    = '0.20',
      opacity  = '0.60',
      customX  = '10',
      customY  = '10',
      logoW,
      logoH
    } = req.body;

    if (!videoFilename) {
      removeFileIfExists(logoPath);
      return res.status(400).json({ success: false, error: 'Thiếu tên file video (videoFilename).' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Thiếu file ảnh logo.' });
    }

    // ── Logic xóa logo cũ ──────────────────────────────────────────
    // Nếu video hiện tại là _logo.mp4 (đã chèn logo trước), dùng bản
    // gốc làm input để tránh _logo_logo.mp4.
    try {
      resolveWithinDirectory(uploadsDir, videoFilename);
    } catch {
      if (logoPath && fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
      return res.status(400).json({ success: false, error: 'Invalid video filename.' });
    }

    let sourceFilename = videoFilename;
    if (videoFilename.endsWith('_logo.mp4')) {
      // Tìm file gốc = bỏ _logo khỏi basename
      const originalName = videoFilename.replace(/_logo\.mp4$/, '.mp4');
      const originalPath = resolveWithinDirectory(uploadsDir, originalName);
      if (fs.existsSync(originalPath)) {
        sourceFilename = originalName;
        console.log(`[AddLogo] Detected existing logo file, using original: ${originalName}`);
        // Xóa file _logo.mp4 cũ
        try { fs.unlinkSync(resolveWithinDirectory(uploadsDir, videoFilename)); } catch { /* Best-effort cleanup. */ }
      }
    }

    const videoPath = resolveWithinDirectory(uploadsDir, sourceFilename);
    if (!fs.existsSync(videoPath)) {
      removeFileIfExists(logoPath);
      return res.status(404).json({ success: false, error: 'Không tìm thấy file video gốc.' });
    }

    // Output filename = original base + _logo.mp4
    const baseName = path.basename(sourceFilename, path.extname(sourceFilename));
    const outputFilename = `${baseName}_logo.mp4`;
    const outputPath = resolveWithinDirectory(uploadsDir, outputFilename);

    // Remove previous output if exists
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch { /* Best-effort cleanup. */ }
    }

    const scaleVal   = Math.min(Math.max(parseFloat(scale) || 0.20, 0.05), 0.80);
    const opacityVal = Math.min(Math.max(parseFloat(opacity) || 0.60, 0.10), 1.0);
    const pad = 20;

    // ── Build ffmpeg filter_complex ────────────────────────────────
    let filterComplex;
    let baseScaleFilter = `[1:v][0:v]scale2ref=w='iw*${scaleVal}':h='-1'[logo_scaled][vid]`;
    if (logoW && logoH) {
      baseScaleFilter = `[1:v]scale=${Math.round(logoW)}:${Math.round(logoH)}[logo_scaled];[0:v]copy[vid]`;
    }

    if (position === 'tiled') {
      const scaleFilter = `${baseScaleFilter};[logo_scaled]format=rgba,colorchannelmixer=aa=${opacityVal}[logo]`;
      filterComplex = [
        scaleFilter,
        `[vid][logo]overlay=(W-w)/2:(H-h)/2[vout]`
      ].join(';');
    } else if (position === 'custom') {
      const cx = parseFloat(customX) / 100;
      const cy = parseFloat(customY) / 100;
      filterComplex = [
        `${baseScaleFilter};[logo_scaled]format=rgba,colorchannelmixer=aa=${opacityVal}[logo]`,
        `[vid][logo]overlay=(W-w)*${cx}:(H-h)*${cy}[vout]`
      ].join(';');
    } else {
      const overlayPositions = {
        'top-left':     `${pad}:${pad}`,
        'top-right':    `W-w-${pad}:${pad}`,
        'bottom-left':  `${pad}:H-h-${pad}`,
        'bottom-right': `W-w-${pad}:H-h-${pad}`,
        'center':       '(W-w)/2:(H-h)/2',
      };
      const overlayExpr = overlayPositions[position] || overlayPositions['bottom-right'];
      filterComplex = [
        `${baseScaleFilter};[logo_scaled]format=rgba,colorchannelmixer=aa=${opacityVal}[logo]`,
        `[vid][logo]overlay=${overlayExpr}[vout]`
      ].join(';');
    }

    console.log(`[AddLogo] video=${sourceFilename} logo=${req.file.filename} pos=${position} scale=${scaleVal} opacity=${opacityVal}`);

    ffmpeg(videoPath)
      .input(logoPath)
      .complexFilter(filterComplex)
      .outputOptions([
        '-map [vout]',
        '-map 0:a?',
        '-c:v libx264',
        '-preset fast',
        '-crf 22',
        '-pix_fmt yuv420p',
        '-c:a copy',
        '-movflags +faststart'
      ])
      .on('start', (cmd) => console.log('[AddLogo] FFmpeg cmd:', cmd))
      .on('end', () => {
        console.log(`[AddLogo] Done → ${outputFilename}`);
        try { if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath); } catch { /* Best-effort cleanup. */ }
        res.json({ success: true, url: `/downloads/${outputFilename}?t=${Date.now()}` });
      })
      .on('error', (err) => {
        console.error('[AddLogo] FFmpeg error:', err.message);
        try { if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath); } catch { /* Best-effort cleanup. */ }
        res.status(500).json({ success: false, error: `Lỗi FFmpeg: ${err.message}` });
      })
      .save(outputPath);

  } catch (err) {
    console.error('[AddLogo] Unexpected error:', err.message);
    try { if (logoPath && fs.existsSync(logoPath)) fs.unlinkSync(logoPath); } catch { /* Best-effort cleanup. */ }
    res.status(500).json({ success: false, error: err.message });
  }
});


// ============================================================
// BULK CONTENT CREATOR - Tạo Content Hàng Loạt
// ============================================================

// Generate bulk marketing content with multimodal support
app.post('/api/bulk-content/generate', async (req, res) => {
  const { input, provider, apiKey, model } = req.body;

  if (!input || !input.product_name || !input.product_description) {
    return res.status(400).json({ error: 'Thiếu thông tin sản phẩm bắt buộc.' });
  }

  const { product_name, product_description, target_customer, platform, tone, number_of_contents, media } = input;

  const systemInstruction = `Bạn là một BẬC THẦY SÁNG TẠO NỘI DUNG TRIỆU VIEW và chuyên gia Marketing Performance hàng đầu, am hiểu sâu sắc tâm lý khách hàng tại thị trường Việt Nam và Campuchia.
NHIỆM VỤ: Tạo bài viết content marketing ĐỘT PHÁ, CÓ KHẢ NĂNG VIRAL cao bằng TIẾNG VIỆT dựa trên dữ liệu sản phẩm và PHÂN TÍCH ĐA PHƯƠNG TIỆN.

CHIẾN LƯỢC TỐI ƯU THEO NỀN TẢNG:
- FACEBOOK: Tập trung vào tiêu đề (Hook) cực mạnh trong 3 dòng đầu, sử dụng câu hỏi tu từ hoặc khẳng định gây sốc. Bố cục thoáng, dễ đọc trên di động.
- TIKTOK (Caption): Ngắn gọn, súc tích, sử dụng nhiều từ khóa xu hướng (trending keywords). Tập trung vào việc thúc đẩy người dùng xem hết video hoặc bình luận.
- SHOPEE/LAZADA: Tập trung vào thông số kỹ thuật, USP rõ ràng, các cam kết bảo hành và ưu đãi sốc. Sử dụng nhiều bullet points để khách hàng dễ so sánh.

CHIẾN LƯỢC THEO TÔNG GIỌNG (TONE) - YÊU CẦU TUÂN THỦ TUYỆT ĐỐI:
- CHUYÊN NGHIỆP: Ngôn từ chuẩn mực, đáng tin cậy, tập trung vào số liệu, bằng chứng và lợi ích cốt lõi. Xưng hô lịch sự (Anh/Chị). Tránh dùng tiếng lóng, từ ngữ quá khích.
- THÂN THIỆN, GẦN GŨI: Ngôn ngữ tự nhiên như đang trò chuyện với bạn bè, tạo sự ấm áp và tin tưởng. Sử dụng các từ ngữ đời thường, gần gũi như "Cả nhà ơi", "Nhà mình ạ".
- HÀI HƯỚC, DÍ DỎM: Sử dụng lối nói ví von, bắt trend, tạo sự gần gũi và tiếng cười. Có thể dùng các từ ngữ trẻ trung, vui nhộn, chơi chữ (pun) nhưng không được làm mất giá trị sản phẩm.
- CẤP BÁCH, THÚC GIỤC: Tập trung vào sự khan hiếm (số lượng có hạn, thời gian sắp hết). Sử dụng các từ mạnh như "NGAY BÂY GIỜ", "CHỈ CÒN", "ĐỪNG BỎ LỠ", "CƠ HỘI CUỐI CÙNG".
- KỂ CHUYỆN (STORYTELLING): Dẫn dắt bằng một tình huống hoặc trải nghiệm thực tế của khách hàng, tạo sự đồng cảm, khơi gợi cảm xúc trước khi giới thiệu sản phẩm là giải pháp.
- BI THƯƠNG, XÚC ĐỘNG: Tập trung vào những nỗi đau sâu sắc, sự thấu cảm và những câu chuyện gây xúc động mạnh. Sử dụng ngôn từ giàu cảm xúc, có phần trầm buồn để chạm đến trái tim, khiến khách hàng cảm thấy được thấu hiểu mội cách chân thành nhất.

NGUYÊN TẮC TRÌNH BÀY & SÁNG TẠO (CỰC KỲ QUAN TRỌNG):
1. LINH HOẠT & ĐA DẠNG: Tuyệt đối KHÔNG áp dụng một cấu trúc rập khuôn cho tất cả các bài viết. Hãy thay đổi thứ tự, cách dẫn dắt và cách trình bày giữa các mẫu content để tránh sự nhàm chán.
2. CÁC PHONG CÁCH TIẾP CẬN GỢI Ý:
   - Phong cách Storytelling: Kể một câu chuyện nhỏ về trải nghiệm khách hàng.
   - Phong cách Trực diện: Đi thẳng vào ưu đãi và giá sốc.
   - Phong cách Giải quyết vấn đề: Nêu nỗi đau của khách hàng và đưa ra sản phẩm là giải pháp.
   - Phong cách Review/Trải nghiệm: Mô tả chi tiết cảm giác khi sử dụng sản phẩm.
3. CẤU TRÚC CHUYÊN NGHIỆP: Dù linh hoạt nhưng bài viết PHẢI có cấu trúc rõ ràng, TUYỆT ĐỐI KHÔNG viết thành một khối văn bản dài (essay-style).
   - TIÊU ĐỀ (HOOK): Thu hút, sử dụng CHỮ IN HOA và EMOJI mạnh mẽ (ví dụ: 🔥, 🆘, 💎, 📣). Có thể đặt ở đầu hoặc lồng ghép tinh tế.
   - SỬ DỤNG ICON LINH HOẠT: Tăng cường sử dụng icon xuyên suốt bài viết để tạo sự sinh động:
     + Lợi ích/Tính năng: ✅, ✨, 🌟, 🛡️, 💯
     + Sự khan hiếm/Gấp gáp: ⏳, ⚡, 🚨, 🛑
     + Vận chuyển/Ưu đãi: 🚚, 🎁, 💸, 🏷️
     + Liên hệ/Hành động: 📲, 📥, 👇, 🗨️
   - CHIA NHỎ ĐOẠN: Mỗi đoạn tối đa 2-3 câu. Giữa các đoạn PHẢI có 1 dòng trống (2 lần xuống dòng).
   - BULLET POINTS: Sử dụng icon đa dạng (không chỉ ✅) để liệt kê, giúp bài viết bắt mắt hơn. Mỗi gạch đầu dòng là 1 dòng riêng biệt.
   - CTA & HASHTAGS: Luôn có lời kêu gọi hành động kèm icon chỉ dẫn (👇, 📩) và hashtag phù hợp.
4. TUÂN THỦ ĐỘ DÀI (CỰC KỲ QUAN TRỌNG): 
   - Tổng độ dài của TOÀN BỘ nội dung BẮT BUỘC CHỈ TỪ 4 ĐẾN 5 DÒNG. 
   - Hãy viết cực kỳ cô đọng, loại bỏ mọi từ thừa, tập trung vào Hook và CTA.
   - Tuyệt đối không được viết dài hơn 5 dòng.
5. QUY TẮC XUỐNG DÒNG: Sử dụng ký tự xuống dòng tiêu chuẩn trong JSON.
6. KIỂM TRA LẠI (TRƯỚC KHI XUẤT):
   - Bài viết đã đúng tông giọng "${tone}" chưa?
   - TỔNG CỘNG CÓ ĐÚNG 4-5 DÒNG KHÔNG? (Nếu dài hơn, hãy cắt bớt ngay lập tức).
   - Đã có đủ: Hook mạnh, Lợi ích chính, CTA sắc bén chưa?

NGUYÊN TẮC ƯU TIÊN DỮ LIỆU:
1. Ưu tiên TUYỆT ĐỐI thông tin trong phần "Mô tả & USP sản phẩm" (Input Text).
2. Xử lý mâu thuẫn: Nếu thông tin trong Video/Hình ảnh KHÁC với thông tin trong Mô tả văn bản, bạn BẮT BUỘC phải dùng thông tin trong Mô tả văn bản.
3. Coi thông tin trong video là thông tin tham khảo/cũ, thông tin trong mô tả là thông tin mới nhất/chính thức.

NGUYÊN TẮC VỀ GIÁ CẢ & TIỀN TỆ:
- TUYỆT ĐỐI KHÔNG thêm các phần giải thích tỷ giá hoặc quy đổi tiền tệ trong ngoặc đơn.
- TUYỆT ĐỐI KHÔNG sử dụng tiếng lóng giá cả Việt Nam như "cành", "lít", "quả", "k". Hãy dùng đơn vị tiền tệ rõ ràng (ví dụ: 6$, 150.000đ).

NGUYÊN TẮC XƯNG HÔ & VĂN PHONG:
- Sử dụng: "Anh/Chị", "Bạn", "Cả nhà". 
- TUYỆT ĐỐI KHÔNG dùng từ "Bong" trong bài viết Tiếng Việt.
- Văn phong lôi cuốn, chuyên nghiệp, không "rẻ tiền", tuân thủ chính sách quảng cáo (không dùng từ ngữ quá đà, cam kết 100%...).

QUY TRÌNH PHÂN TÍCH:
- Bước 1: Đọc kỹ "Mô tả & USP sản phẩm" để nắm bắt giá bán và thông tin cốt lõi.
- Bước 2: Lắng nghe lời thoại/xem hình ảnh để lấy thêm cảm xúc, bối cảnh, tính năng phụ.
- Bước 3: Viết bài trình bày đẹp mắt, xuống dòng hợp lý, sử dụng icon tinh tế.

TUYỆT ĐỐI TRÁNH:
- KHÔNG viết nội dung chung chung, sáo rỗng kiểu "Sản phẩm tuyệt vời nhất", "Chúng tôi tự hào giới thiệu".
- KHÔNG lặp lại một cấu trúc cho nhiều bài viết.
- KHÔNG dùng từ ngữ máy móc, hãy dùng ngôn ngữ đời thường, "đắt" và có tính thuyết phục cao.`;

  const prompt = `Dữ liệu chiến dịch:
- Sản phẩm: ${product_name}
- Mô tả & USP (ƯU TIÊN SỐ 1): ${product_description}
- Đối tượng: ${target_customer}
- Nền tảng: ${platform}
- Tông giọng: ${tone}
- Độ dài yêu cầu: SIÊU NGẮN (CHỈ 4-5 DÒNG)

Hãy phân tích kỹ các file media đính kèm (nếu có) nhưng hãy nhớ: NẾU MÔ TẢ CÓ GIÁ, HÃY DÙNG GIÁ TRONG MÔ TẢ, BỎ QUA GIÁ TRONG VIDEO.
Tạo ${number_of_contents} mẫu content bán hàng Tiếng Việt tối ưu nhất. 
YÊU CẦU QUAN TRỌNG: 
1. BÁM SÁT TÔNG GIỌNG: Tất cả các mẫu content PHẢI thể hiện rõ rệt tông giọng "${tone}". Bạn phải hóa thân hoàn vào nhân vật có tông giọng này.
2. ĐA DẠNG CẤU TRÚC: Mỗi mẫu content phải có phong cách tiếp cận và cấu trúc trình bày KHÁC NHAU.
3. NGÔN NGỮ: Sử dụng Tiếng Việt tự nhiên, lôi cuốn.
4. ĐỘ DÀI SIÊU NGẮN: Mỗi bài viết BẮT BUỘC CHỈ ĐƯỢC DÀI 4-5 DÒNG (bao gồm cả tiêu đề và CTA). Đây là yêu cầu quan trọng hàng đầu. Tối ưu cho việc đọc nhanh.`;

  try {
    const responseSchema = {
      type: "object",
      properties: {
        contents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              body: { type: "string" }
            },
            required: ["body"]
          }
        }
      },
      required: ["contents"]
    };
    
    let firstImage = null;
    if (media && media.length > 0) {
      firstImage = media[0].data;
    }

    const result = await callAI(prompt, systemInstruction, provider, apiKey, model, responseSchema, 0.7, firstImage);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Bulk generate error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Translate marketing content to Khmer or Lao
app.post('/api/bulk-content/translate', async (req, res) => {
  const { text, lang, provider, apiKey, model } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Nội dung dịch không được để trống.' });
  }

  const targetLang = (lang || 'khmer').toLowerCase();
  
  let systemInstruction;
  let responseSchema = {
    type: "object",
    properties: {
      body: { type: "string" },
      score: { type: "integer" }
    },
    required: ["body", "score"]
  };

  if (targetLang === 'khmer') {
    systemInstruction = `Bạn là một chuyên gia Marketing Performance bản địa tại Campuchia. 
NHIỆM VỤ: Dịch content marketing từ Tiếng Việt sang Tiếng Khmer.

QUY TẮC ICON CỰC KỲ QUAN TRỌNG (ĐỂ TRÁNH LỖI HIỂN THỊ):
1. GIỮ NGUYÊN ICON: Sao chép y hệt các icon/emoji từ bản gốc. KHÔNG thay đổi mã Unicode của chúng. 
2. KHÔNG THÊM KÝ TỰ ĐIỀU KHIỂN: Tuyệt đối không thêm các ký tự ẩn như "Variation Selector" (U+FE0F) hoặc các ký tự gây ra lỗi ô vuông bên cạnh icon số (1️⃣, 2️⃣, 3️⃣).
3. BỐ CỤC: Giữ nguyên số lần xuống dòng và vị trí icon so với văn bản. Bản dịch Khmer phải có ngoại quan giống 100% bản gốc.
4. QUY TẮC XUỐNG DÒNG: Sử dụng ký tự xuống dòng tiêu chuẩn.

YÊU CẦU LÀM SẠCH VÀ NGÔN NGỮ:
- Loại bỏ mọi phần quy đổi tiền tệ Việt Nam (150K, cành, k...).
- Dịch 100% sang Tiếng Khmer chuẩn bản địa.
- QUAN TRỌNG: Khi xưng hô "Bong" (anh/chị/bạn), BẮT BUỘC phải dùng chữ Khmer là "បង", TUYỆT ĐỐI KHÔNG dùng chữ Latinh "Bong".

CHỈ TRẢ VỀ JSON.`;
  } else {
    systemInstruction = `Bạn là một chuyên gia Marketing Performance bản địa tại Lào. 
NHIỆM VỤ: Dịch content marketing từ Tiếng Việt sang Tiếng Lào.

QUY TẮC ICON CỰC KỲ QUAN TRỌNG:
1. GIỮ NGUYÊN ICON: Sao chép y hệt các icon/emoji từ bản gốc. KHÔNG thay đổi mã Unicode của chúng. 
2. BỐ CỤC: Giữ nguyên số lần xuống dòng và vị trí icon so với văn bản. Bản dịch Lào phải có ngoại quan giống 100% bản gốc.
3. QUY TẮC XUỐNG DÒNG: Sử dụng ký tự xuống dòng tiêu chuẩn.

YÊU CẦU LÀM SẠCH VÀ NGÔN NGỮ:
- Loại bỏ mọi phần quy đổi tiền tệ Việt Nam.
- Dịch 100% sang Tiếng Lào chuẩn bản địa.

CHỈ TRẢ VỀ JSON.`;
  }

  const prompt = `Dịch nội dung sau sang Tiếng ${targetLang === 'khmer' ? 'Khmer' : 'Lào'}. Yêu cầu giữ nguyên icon bit-for-bit, không làm sai lệch emoji gốc:\n\n${text}`;

  try {
    const result = await callAI(prompt, systemInstruction, provider, apiKey, model, responseSchema, 0.1);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Bulk translation error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve frontend in production (optional, we can make it ready)

const frontendDist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}
// Restart nodemon 1

app.listen(PORT, HOST, () => {
  console.log(`Backend server running on http://${HOST}:${PORT}`);
});
