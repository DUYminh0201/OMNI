import { spawn, execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../../..');

const BIN_DIR = path.join(workspaceRoot, 'runtime', 'bin');
const YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp.exe');

export async function ensureYtDlpBinary() {
  if (fs.existsSync(YTDLP_PATH) && fs.statSync(YTDLP_PATH).size > 5_000_000) {
    return YTDLP_PATH;
  }
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  console.log('[yt-dlp] Downloading binary from GitHub releases...');
  const res = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe');
  if (!res.ok) throw new Error(`Could not download yt-dlp binary (HTTP ${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(YTDLP_PATH, Buffer.from(arrayBuffer));
  console.log('[yt-dlp] Binary ready at:', YTDLP_PATH);
  return YTDLP_PATH;
}

export async function fetchYouTubeInfo(url) {
  const binPath = await ensureYtDlpBinary();
  return new Promise((resolve, reject) => {
    try {
      execFile(binPath, ['-j', '--no-warnings', url], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          console.error('[yt-dlp info error]', stderr || err.message);
          return reject(new Error(stderr || err.message));
        }
        try {
          const json = JSON.parse(stdout);
          const thumbnails = json.thumbnails || [];
          const cover = thumbnails.length ? (thumbnails[thumbnails.length - 1]?.url || '') : (json.thumbnail || '');
          resolve({
            title: json.title || 'YouTube Video',
            cover,
            duration: json.duration || 0,
            author: json.uploader || json.channel || '',
            originalUrl: url,
            youtubeVideoId: json.id,
          });
        } catch (e) {
          reject(e);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

export async function streamYouTubeMedia(url, type, name, res, ffmpegPath) {
  const binPath = await ensureYtDlpBinary();
  return new Promise((resolve, reject) => {
    try {
      const isAudio = type === 'audio';

      const formatArg = isAudio
        ? 'bestaudio[ext=m4a]/bestaudio/best'
        : 'bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1440]+bestaudio/best[height<=1440]/best';

      const args = [
        '-f', formatArg,
        '--merge-output-format', 'mp4',
        '-o', '-',
        '--no-warnings',
        url,
      ];

      if (ffmpegPath) {
        args.push('--ffmpeg-location', ffmpegPath);
      }

      const contentType = isAudio ? 'audio/mp4' : 'video/mp4';
      const defaultFilename = isAudio ? 'youtube_audio.m4a' : 'youtube_video.mp4';
      const filename = name || defaultFilename;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

      const child = spawn(binPath, args);

      child.stdout.pipe(res);

      let stderrData = '';
      child.stderr.on('data', (chunk) => {
        stderrData += chunk.toString();
      });

      reqCloseHandler(res, child);

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          console.error('[yt-dlp stream error] exit code:', code, stderrData);
          if (!res.headersSent) {
            res.status(500).send('Lỗi khi tải video từ YouTube.');
          }
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        console.error('[yt-dlp process error]', err);
        if (!res.headersSent) {
          res.status(500).send('Lỗi hệ thống khi khởi chạy yt-dlp.');
        }
        reject(err);
      });

    } catch (err) {
      if (!res.headersSent) {
        res.status(500).send(err.message);
      }
      reject(err);
    }
  });
}

function reqCloseHandler(res, child) {
  res.on('close', () => {
    if (!child.killed) {
      try {
        child.kill();
      } catch {
        // Process might have already terminated
      }
    }
  });
}
