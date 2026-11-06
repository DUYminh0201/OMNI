/**
 * Marketing Flow MCP Server
 *
 * Giao thức: Model Context Protocol (MCP) — Stdio Transport
 * Kết nối: HTTP proxy → Express server (localhost:PORT)
 *
 * QUAN TRỌNG: stdout dành RIÊNG cho JSON-RPC MCP.
 * Mọi log/debug phải đi qua console.error() hoặc process.stderr.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// ─── Cấu hình ───────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../../..');

const PORT = process.env.PORT || 3002;
const BASE_URL = `http://localhost:${PORT}`;

// Thư mục uploads (đồng bộ với server.js)
const uploadsDir = process.env.USER_DATA_PATH
  ? path.join(process.env.USER_DATA_PATH, 'uploads')
  : path.join(workspaceRoot, 'runtime', 'uploads');

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function callApi(method, apiPath, body) {
  const url = `${BASE_URL}${apiPath}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    throw new Error(
      `Không thể kết nối tới Marketing Flow server (${BASE_URL}). ` +
      `Hãy chắc chắn "npm run dev" đang chạy trước. Chi tiết: ${err.message}`,
      { cause: err }
    );
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Server trả về dữ liệu không hợp lệ (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}: ${res.statusText}`);
  }

  return data;
}

function log(...args) {
  process.stderr.write('[MCP] ' + args.join(' ') + '\n');
}

// ─── Tool Handlers ───────────────────────────────────────────────────────────

// ① get_video_info — Lấy metadata video từ URL
async function handleGetVideoInfo({ video_url }) {
  log(`get_video_info: ${video_url}`);
  const data = await callApi('POST', '/api/video/info', { url: video_url });
  if (!data.success) throw new Error(data.error || 'Không lấy được thông tin video.');
  const v = data.data;
  return [
    `✅ Thông tin video (${v.platform || 'unknown'}):`,
    `• Tiêu đề: ${v.title || 'N/A'}`,
    `• Tác giả: ${v.author?.unique_id ? '@' + v.author.unique_id : (v.author || 'N/A')}`,
    `• Nền tảng: ${v.platform || 'N/A'}`,
    `• Thumbnail: ${v.cover || v.thumbnail || 'N/A'}`,
    `• URL phát: ${v.play ? v.play.slice(0, 80) + '...' : 'N/A'}`,
    `• originalUrl: ${v.originalUrl || video_url}`,
  ].join('\n');
}

// ② download_video — Tải video về thư mục uploads
async function handleDownloadVideo({ video_url, quality = 'best' }) {
  log(`download_video: ${video_url} (quality=${quality})`);

  // Bước 1: Lấy metadata
  const infoData = await callApi('POST', '/api/video/info', { url: video_url });
  if (!infoData.success) throw new Error(infoData.error || 'Không lấy được thông tin video.');
  const v = infoData.data;
  const platform = v.platform || 'tiktok';

  // Bước 2: Xác định URL tải
  const safeTitle = (v.title || 'video').replace(/[^\w-]/g, '_').slice(0, 60);
  const filename = `${safeTitle}_${Date.now()}.mp4`;

  let downloadUrl;
  if (platform === 'youtube') {
    downloadUrl = `/api/video/download?platform=youtube&originalUrl=${encodeURIComponent(video_url)}&name=${encodeURIComponent(filename)}`;
  } else if (platform === 'douyin' || platform === 'tiktok') {
    const playUrl = v.play || '';
    if (!playUrl) throw new Error('Không tìm được URL stream của video này.');
    downloadUrl = `/api/video/download?platform=${platform}&url=${encodeURIComponent(playUrl)}&name=${encodeURIComponent(filename)}&originalUrl=${encodeURIComponent(video_url)}`;
  } else {
    throw new Error(`Nền tảng "${platform}" chưa được hỗ trợ cho tải xuống trực tiếp.`);
  }

  // Bước 3: Tải về file
  const fullDownloadUrl = `${BASE_URL}${downloadUrl}`;
  log(`Đang tải từ: ${fullDownloadUrl.slice(0, 100)}...`);

  let fetchRes;
  try {
    fetchRes = await fetch(fullDownloadUrl, { signal: AbortSignal.timeout(120_000) });
  } catch (err) {
    throw new Error(`Không kết nối được server để tải video: ${err.message}`, { cause: err });
  }

  if (!fetchRes.ok) {
    throw new Error(`Lỗi tải video từ server (HTTP ${fetchRes.status}).`);
  }

  // Đảm bảo thư mục uploads tồn tại
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const filePath = path.join(uploadsDir, filename);
  const buffer = Buffer.from(await fetchRes.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  log(`Đã tải xong: ${filePath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

  return [
    `✅ Tải video thành công!`,
    `• Tiêu đề: ${v.title || filename}`,
    `• Nền tảng: ${platform}`,
    `• Kích thước: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`,
    `• filePath: ${filePath}`,
    `• filename: ${filename}`,
    `\nℹ️ Dùng "filename" ở trên làm tham số video_path khi gọi dub_video.`,
  ].join('\n');
}

// ③ dub_video — Pipeline lồng tiếng đầy đủ
const LANG_MAP = {
  vi: 'Tiếng Việt', en: 'Tiếng Anh', ja: 'Tiếng Nhật',
  ko: 'Tiếng Hàn', fr: 'Tiếng Pháp', de: 'Tiếng Đức',
  es: 'Tiếng Tây Ban Nha', lo: 'Tiếng Lào', km: 'Tiếng Khmer',
};

const VOICE_MAP = {
  male: { gemini: 'Puck', edge: 'vi-VN-NamMinhNeural' },
  female: { gemini: 'Kore', edge: 'vi-VN-HoaiMyNeural' },
};

async function handleDubVideo({ video_path, target_language, voice_gender = 'female' }) {
  log(`dub_video: ${video_path} → ${target_language} (${voice_gender})`);

  const targetLangName = LANG_MAP[target_language] || target_language;
  const voice = VOICE_MAP[voice_gender]?.gemini || 'Kore';

  // Resolve filename
  let videoFilename = path.isAbsolute(video_path)
    ? path.basename(video_path)
    : video_path;

  // Kiểm tra file tồn tại
  const resolvedPath = path.isAbsolute(video_path)
    ? video_path
    : path.join(uploadsDir, video_path);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `File không tồn tại: "${resolvedPath}". ` +
      `Hãy dùng download_video trước để tải video về, rồi dùng filename/filePath từ kết quả đó.`
    );
  }

  // Nếu file nằm ngoài uploads, copy vào
  const uploadedPath = path.join(uploadsDir, videoFilename);
  if (resolvedPath !== uploadedPath && !fs.existsSync(uploadedPath)) {
    fs.copyFileSync(resolvedPath, uploadedPath);
    log(`Đã copy file vào uploads: ${uploadedPath}`);
  }

  log('Bước 1/5: Tách âm thanh...');
  const audioData = await callApi('POST', '/api/extract-audio', { filename: videoFilename });
  if (!audioData.audio) throw new Error(audioData.error || 'Tách âm thanh thất bại.');

  log('Bước 2/5: Nhận dạng lời thoại (AI Transcribe)...');
  const transcribeData = await callApi('POST', '/api/dubbing/transcribe', {
    audioBase64: audioData.audio,
    provider: 'gemini',
    model: 'gemini-3.5-flash',
  });
  if (!transcribeData.success) throw new Error(transcribeData.error || 'Nhận dạng lời thoại thất bại.');
  const segments = transcribeData.data;

  log(`Bước 3/5: Dịch ${segments.length} đoạn sang ${targetLangName}...`);
  const translateData = await callApi('POST', '/api/dubbing/translate', {
    segments,
    targetLanguage: targetLangName,
    provider: 'gemini',
    model: 'gemini-3.5-flash',
  });
  if (!translateData.success) throw new Error(translateData.error || 'Dịch thuật thất bại.');
  const translatedSegments = translateData.data;

  log('Bước 4/5: Tổng hợp giọng đọc TTS...');
  const fullText = translatedSegments.map(s => s.translatedText || '').join(' ').trim();
  if (!fullText) throw new Error('Không có nội dung dịch để lồng tiếng.');

  const speechData = await callApi('POST', '/api/dubbing/speech', {
    text: fullText,
    voiceName: voice,
    targetLanguage: targetLangName,
  });
  if (!speechData.success) throw new Error(speechData.error || 'Tổng hợp giọng đọc thất bại.');

  log('Bước 5/5: Ghép âm thanh vào video...');
  const mergeData = await callApi('POST', '/api/merge', {
    videoFilename,
    audioBase64: speechData.data,
    videoQuality: 'original',
    audioMode: 'keep_fx',
    includeSubtitles: false,
    transcript: translatedSegments,
  });
  if (!mergeData.success) throw new Error(mergeData.error || 'Ghép video thất bại.');

  const outputFilename = mergeData.url.split('/').pop().split('?')[0];
  const outputPath = path.join(uploadsDir, outputFilename);

  log(`Lồng tiếng hoàn tất: ${outputPath}`);
  return [
    `✅ Lồng tiếng thành công!`,
    `• Video gốc: ${videoFilename}`,
    `• Ngôn ngữ đích: ${targetLangName}`,
    `• Giọng đọc: ${voice} (${voice_gender})`,
    `• Số đoạn thoại: ${segments.length}`,
    `• outputPath: ${outputPath}`,
    `• downloadUrl: ${BASE_URL}${mergeData.url}`,
  ].join('\n');
}

// ④ generate_content — Tạo content marketing hàng loạt
async function handleGenerateContent({ product_name, product_description, target_customer, platform, tone, number_of_contents }) {
  log(`generate_content: "${product_name}" × ${number_of_contents} (${platform} / ${tone})`);
  const data = await callApi('POST', '/api/bulk-content/generate', {
    input: {
      product_name,
      product_description,
      target_customer: target_customer || 'Khách hàng phổ thông',
      platform: platform || 'Facebook',
      tone: tone || 'Thân thiện, gần gũi',
      number_of_contents: number_of_contents || 3,
    },
    provider: 'gemini',
  });
  if (!data.success) throw new Error(data.error || 'Tạo content thất bại.');
  const contents = data.data?.contents || [];
  const lines = [`✅ Đã tạo ${contents.length} mẫu content cho "${product_name}":\n`];
  contents.forEach((c, i) => {
    lines.push(`━━━ Mẫu ${i + 1} ━━━\n${c.body}\n`);
  });
  return lines.join('\n');
}

// ⑤ translate_content — Biên tập / dịch caption sang Khmer hoặc Lào
async function handleTranslateContent({ text, target_language, style, length }) {
  log(`translate_content: ${text.length} ký tự → ${target_language}`);

  if (target_language === 'khmer' || target_language === 'lao') {
    const data = await callApi('POST', '/api/bulk-content/translate', {
      text,
      lang: target_language,
      provider: 'gemini',
    });
    if (!data.success) throw new Error(data.error || 'Dịch thất bại.');
    return [
      `✅ Đã dịch sang ${target_language === 'khmer' ? 'Tiếng Khmer 🇰🇭' : 'Tiếng Lào 🇱🇦'}:`,
      `\n${data.data?.body || ''}`,
      `\n📊 Điểm chất lượng: ${data.data?.score ?? 'N/A'}/10`,
    ].join('\n');
  } else {
    // Biên tập VN + tạo bản Khmer (dùng endpoint ai/translate)
    const data = await callApi('POST', '/api/ai/translate', {
      text,
      style: style || 'Thân thiện, gần gũi',
      length: length || 'Vừa phải (5-10 câu)',
      provider: 'gemini',
      replicationMode: false,
    });
    if (!data.success) throw new Error(data.error || 'Biên tập thất bại.');
    return [
      `✅ Đã biên tập & dịch content:`,
      `\n🇻🇳 Tiếng Việt:\n${data.data?.vietnamese || ''}`,
      `\n🇰🇭 Tiếng Khmer:\n${data.data?.khmer || ''}`,
    ].join('\n');
  }
}

// ⑥ analyze_market — Nghiên cứu thị trường sản phẩm
async function handleAnalyzeMarket({ product_name, product_description, competitor_link, framework }) {
  log(`analyze_market: "${product_name}" (framework=${framework})`);
  const data = await callApi('POST', '/api/market-intelligence', {
    product: product_name + (product_description ? '\n' + product_description : ''),
    competitor_link: competitor_link || '',
    framework: framework || 'full',
    provider: 'gemini',
  });
  if (!data.success) throw new Error(data.error || 'Phân tích thị trường thất bại.');
  const result = data.data;
  const fw = data.framework || framework || 'full';

  let output = `✅ Báo cáo Market Intelligence cho "${product_name}":\n\n`;

  if (fw === 'full') {
    output += `📊 TÓM TẮT:\n${result.executive_summary || result.summary || JSON.stringify(result, null, 2).slice(0, 2000)}\n`;
  } else if (fw === 'first_principles') {
    output += `🔬 PRODUCT FEATURE ANALYTICS:\n${result.executive_summary || JSON.stringify(result, null, 2).slice(0, 2000)}\n`;
  } else if (fw === 'pain_point') {
    output += `🧠 CUSTOMER INSIGHT:\n${result.executive_summary || JSON.stringify(result, null, 2).slice(0, 2000)}\n`;
  }

  output += `\nℹ️ Mở ứng dụng Marketing Flow → tab "Nghiên Cứu Thị Trường" để xem báo cáo chi tiết đầy đủ.`;
  return output;
}

// ─── Khởi tạo MCP Server ─────────────────────────────────────────────────────

const server = new McpServer({
  name: 'marketing-flow-mcp',
  version: '1.0.0',
});

// ── Tool 1: get_video_info ───────────────────────────────────────────────────
server.tool(
  'get_video_info',
  'Lấy thông tin metadata (tiêu đề, tác giả, thumbnail) của video từ URL YouTube, TikTok hoặc Douyin.',
  {
    video_url: z.string().url().describe('URL đầy đủ của video (YouTube, TikTok, Douyin)'),
  },
  async ({ video_url }) => {
    try {
      const text = await handleGetVideoInfo({ video_url });
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `❌ Lỗi: ${err.message}` }] };
    }
  }
);

// ── Tool 2: download_video ───────────────────────────────────────────────────
server.tool(
  'download_video',
  'Tải video từ URL YouTube, TikTok hoặc Douyin về máy (thư mục runtime/uploads). Trả về đường dẫn file để dùng với dub_video.',
  {
    video_url: z.string().url().describe('URL đầy đủ của video cần tải'),
    quality: z.enum(['best', '1080p', '720p']).optional().default('best').describe('Chất lượng video. Mặc định: best'),
  },
  async ({ video_url, quality }) => {
    try {
      const text = await handleDownloadVideo({ video_url, quality });
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `❌ Lỗi: ${err.message}` }] };
    }
  }
);

// ── Tool 3: dub_video ────────────────────────────────────────────────────────
server.tool(
  'dub_video',
  'Lồng tiếng video đầy đủ: tách âm → nhận dạng thoại (AI) → dịch thuật → tổng hợp giọng TTS → ghép vào video. Cần Gemini API Key được cấu hình trong app.',
  {
    video_path: z.string().describe('Tên file video (vd: my_video.mp4) hoặc đường dẫn tuyệt đối tới file trong uploads/.'),
    target_language: z.enum(['vi', 'en', 'ja', 'ko', 'km', 'lo', 'fr', 'de', 'es']).describe('Mã ngôn ngữ đích: vi=Việt, en=Anh, ja=Nhật, ko=Hàn, km=Khmer, lo=Lào, fr=Pháp, de=Đức, es=TBN'),
    voice_gender: z.enum(['male', 'female']).optional().default('female').describe('Giọng đọc TTS: male hoặc female. Mặc định: female'),
  },
  async ({ video_path, target_language, voice_gender }) => {
    try {
      const text = await handleDubVideo({ video_path, target_language, voice_gender });
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `❌ Lỗi: ${err.message}` }] };
    }
  }
);

// ── Tool 4: generate_content ─────────────────────────────────────────────────
server.tool(
  'generate_content',
  'Tạo hàng loạt mẫu content marketing Tiếng Việt dựa trên thông tin sản phẩm. Hỗ trợ Facebook, TikTok, Instagram, Shopee... Cần Gemini API Key.',
  {
    product_name: z.string().describe('Tên sản phẩm cần tạo content'),
    product_description: z.string().describe('Mô tả sản phẩm, USP, giá bán, ưu điểm nổi bật...'),
    target_customer: z.string().optional().default('Khách hàng phổ thông').describe('Đối tượng khách hàng mục tiêu'),
    platform: z.enum(['Facebook', 'TikTok', 'Instagram', 'Zalo', 'Google', 'Shopee']).optional().default('Facebook').describe('Nền tảng đăng content'),
    tone: z.enum([
      'Thân thiện, gần gũi',
      'Chuyên nghiệp',
      'Hài hước, dí dỏm',
      'Cấp bách, thúc giục',
      'Kể chuyện (Storytelling)',
      'Bi thương, xúc động',
    ]).optional().default('Thân thiện, gần gũi').describe('Tông giọng viết content'),
    number_of_contents: z.number().int().min(1).max(10).optional().default(3).describe('Số lượng mẫu content cần tạo (1–10)'),
  },
  async (args) => {
    try {
      const text = await handleGenerateContent(args);
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `❌ Lỗi: ${err.message}` }] };
    }
  }
);

// ── Tool 5: translate_content ────────────────────────────────────────────────
server.tool(
  'translate_content',
  'Biên tập và dịch caption Tiếng Việt sang Tiếng Khmer hoặc Tiếng Lào. Hỗ trợ cả chế độ nhân bản (tạo đồng thời bản VN mới + bản Khmer). Cần Gemini API Key.',
  {
    text: z.string().describe('Nội dung caption / bài viết Tiếng Việt cần biên tập hoặc dịch'),
    target_language: z.enum(['khmer', 'lao', 'vi_to_km']).describe('Ngôn ngữ đích: khmer=dịch sang Khmer, lao=dịch sang Lào, vi_to_km=biên tập VN rồi tạo bản Khmer'),
    style: z.string().optional().describe('Phong cách: Storytelling / Tạo Viral / Chuẩn SEO / Tối ưu Bán hàng'),
    length: z.string().optional().describe('Độ dài: Ngắn gọn (3-5 câu) / Vừa phải (5-10 câu) / Chi tiết (10+ câu)'),
  },
  async (args) => {
    try {
      const text = await handleTranslateContent(args);
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `❌ Lỗi: ${err.message}` }] };
    }
  }
);

// ── Tool 6: analyze_market ───────────────────────────────────────────────────
server.tool(
  'analyze_market',
  'Nghiên cứu thị trường sản phẩm tại Campuchia: phân tích đối thủ cạnh tranh, insight khách hàng, ma trận góc tiếp cận marketing. Cần Gemini API Key.',
  {
    product_name: z.string().describe('Tên sản phẩm / thương hiệu cần nghiên cứu'),
    product_description: z.string().optional().default('').describe('Mô tả sản phẩm, đặc điểm, giá bán...'),
    competitor_link: z.string().optional().default('').describe('URL trang web / bài đăng Facebook của đối thủ (tuỳ chọn, để crawler phân tích)'),
    framework: z.enum(['full', 'first_principles', 'pain_point']).optional().default('full').describe('Loại phân tích: full=Toàn diện, first_principles=Tính năng sản phẩm, pain_point=Insight khách hàng'),
  },
  async (args) => {
    try {
      const text = await handleAnalyzeMarket(args);
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `❌ Lỗi: ${err.message}` }] };
    }
  }
);

// ─── Khởi động ───────────────────────────────────────────────────────────────

async function main() {
  log(`Marketing Flow MCP Server v1.0.0 đang khởi động...`);
  log(`Express server target: ${BASE_URL}`);
  log(`Uploads directory: ${uploadsDir}`);
  log(`Tools đã đăng ký: get_video_info, download_video, dub_video, generate_content, translate_content, analyze_market`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log(`✅ MCP Server đã kết nối qua stdio. Sẵn sàng nhận lệnh từ MCP Client.`);
}

main().catch((err) => {
  process.stderr.write(`[MCP] FATAL ERROR: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
