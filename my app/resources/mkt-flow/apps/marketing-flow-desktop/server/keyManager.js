import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../../..');

const DB_DIR = process.env.USER_DATA_PATH 
  ? path.join(process.env.USER_DATA_PATH, 'db')
  : path.join(workspaceRoot, 'runtime', 'database');
const DB_FILE = path.join(DB_DIR, 'keys.json');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

export class KeyManager {
  constructor() {
    this.keys = {
      gemini: [],
      openai: [],
      nvidia: []
    };
    this.currentIndex = {
      gemini: 0,
      openai: 0,
      nvidia: 0
    };
    this.load();
    this.startUnlockWorker();
    this.watchFile();
  }

  load() {
    if (fs.existsSync(DB_FILE)) {
      try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(data);
        this.keys = { ...this.keys, ...parsed };
        const now = Date.now();
        let changed = false;
        for (const p of Object.keys(this.keys)) {
          for (const k of this.keys[p]) {
            if (k.status === 'LIMITED_RPM' || (k.status === 'LIMITED_RPD' && (!k.reset_at || now >= k.reset_at))) {
              k.status = 'ACTIVE';
              k.fail_count = 0;
              k.reset_at = null;
              changed = true;
            }
          }
        }
        if (changed) this.save();
      } catch (e) {
        console.error('[KeyManager] Failed to load keys.json:', e);
      }
    } else {
      this.save();
    }
  }

  watchFile() {
    try {
      if (fs.existsSync(DB_FILE)) {
        fs.watch(DB_FILE, (eventType) => {
          if (eventType === 'change') {
            this.load();
          }
        });
      }
    } catch (_) {}
  }

  save() {
    try {
      if (fs.existsSync(DB_FILE)) {
        try {
          const onDisk = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
          for (const p of Object.keys(onDisk)) {
            if (!this.keys[p]) this.keys[p] = [];
            for (const dk of onDisk[p]) {
              const mem = this.keys[p].find(k => k.api_key === dk.api_key);
              if (!mem) {
                this.keys[p].push(dk);
              }
            }
          }
        } catch (_) {}
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.keys, null, 2), 'utf8');
    } catch (e) {
      console.error('[KeyManager] Failed to save keys.json:', e);
    }
  }

  getAllKeys(provider) {
    return this.keys[provider] || [];
  }

  addKey(provider, api_key) {
    if (!this.keys[provider]) this.keys[provider] = [];
    
    if (this.keys[provider].some(k => k.api_key === api_key)) {
      return false; // already exists
    }

    const newKey = {
      id: crypto.randomUUID(),
      api_key,
      status: 'ACTIVE',
      fail_count: 0,
      reset_at: null,
      added_at: Date.now()
    };
    this.keys[provider].push(newKey);
    this.save();
    return newKey;
  }

  deleteKey(provider, id) {
    if (!this.keys[provider]) return false;
    const initialLen = this.keys[provider].length;
    this.keys[provider] = this.keys[provider].filter(k => k.id !== id);
    if (this.keys[provider].length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  updateKeyStatus(provider, api_key, status, reset_at = null) {
    if (!this.keys[provider]) return;
    const keyObj = this.keys[provider].find(k => k.api_key === api_key);
    if (keyObj) {
      keyObj.status = status;
      keyObj.reset_at = reset_at;
      if (status === 'ACTIVE') {
        keyObj.fail_count = 0;
      }
      this.save();
    }
  }

  incrementFailCount(provider, api_key) {
    if (!this.keys[provider]) return 0;
    const keyObj = this.keys[provider].find(k => k.api_key === api_key);
    if (keyObj) {
      keyObj.fail_count = (keyObj.fail_count || 0) + 1;
      this.save();
      return keyObj.fail_count;
    }
    return 0;
  }

  unlockKey(provider, id) {
    if (!this.keys[provider]) return false;
    const keyObj = this.keys[provider].find(k => k.id === id);
    if (keyObj) {
      keyObj.status = 'ACTIVE';
      keyObj.fail_count = 0;
      keyObj.reset_at = null;
      this.save();
      return true;
    }
    return false;
  }

  getActiveKey(provider) {
    if (!this.keys[provider] || this.keys[provider].length === 0) {
      this.load();
    }
    const list = (this.keys[provider] || []).filter(k => k.status === 'ACTIVE');
    if (list.length === 0) {
      const now = Date.now();
      const recoverable = (this.keys[provider] || []).find(k => (k.status === 'LIMITED_RPM' || k.status === 'LIMITED_RPD') && (!k.reset_at || now >= k.reset_at));
      if (recoverable) {
        recoverable.status = 'ACTIVE';
        recoverable.fail_count = 0;
        recoverable.reset_at = null;
        this.save();
        return recoverable;
      }
      return null;
    }
    if (!this.currentIndex) this.currentIndex = {};
    if (typeof this.currentIndex[provider] !== 'number') this.currentIndex[provider] = 0;
    const selected = list[this.currentIndex[provider] % list.length];
    this.currentIndex[provider] = (this.currentIndex[provider] + 1) % list.length;
    return selected;
  }

  startUnlockWorker() {
    setInterval(() => {
      let changed = false;
      const now = Date.now();
      for (const provider of Object.keys(this.keys)) {
        for (const k of this.keys[provider]) {
          if ((k.status === 'LIMITED_RPM' || k.status === 'LIMITED_RPD') && k.reset_at && now >= k.reset_at) {
            k.status = 'ACTIVE';
            k.fail_count = 0;
            k.reset_at = null;
            changed = true;
            console.log(`[KeyManager] Tự động Unlock key cho ${provider}`);
          }
        }
      }
      if (changed) this.save();
    }, 10 * 1000); // Check every 10 seconds
  }

  async runWithKeyRotation(provider, taskFn) {
    const MAX_RETRIES = 4; // 4 retries: 2s, 4s, 8s, 16s
    const BACKOFF_BASE = 2000; 
    const COOLDOWN_24H = 24 * 60 * 60 * 1000; // 24 hours for RPD Quota
    const COOLDOWN_2M = 2 * 60 * 1000; // 2 mins for RPM Rate Limit

    while (true) {
      const activeKeyObj = this.getActiveKey(provider);
      if (!activeKeyObj) {
        throw new Error(`[KeyManager] Cạn kiệt API Key. Không có key ACTIVE nào cho ${provider}.`);
      }

      const apiKey = activeKeyObj.api_key;
      let attempt = 1;

      while (attempt <= MAX_RETRIES + 1) {
        try {
          return await taskFn(apiKey);
        } catch (error) {
          const status = error.response?.status;
          const isTransient = [502, 503, 504].includes(status) || error.code === 'ECONNABORTED' || (error.message || '').includes('timeout');
          
          const msg = (error.response?.data?.error?.message || error.message || '').toLowerCase();
          const isInvalidKey = status === 401 || msg.includes('invalid api key') || msg.includes('api_key_invalid') || msg.includes('api key not valid');
          
          // Phân biệt: Gemini báo 'Quota exceeded... per minute' là RATE LIMIT (RPM), KHÔNG PHẢI RPD hết quota ngày!
          const isDailyQuota = status === 403 || (status === 429 && (/per day|daily|rpd/i.test(msg) || (msg.includes('quota') && !/per minute|minute|rpm/i.test(msg))));
          const isRateLimit = status === 429 && !isDailyQuota || msg.includes('resource_exhausted') || /per minute|minute|rpm/i.test(msg);

          if (isDailyQuota) {
            console.warn(`[KeyManager] Key ${provider} (${apiKey.substring(0, 8)}...) hết Quota ngày (RPD). Đổi key kế tiếp...`);
            this.updateKeyStatus(provider, apiKey, 'LIMITED_RPD', Date.now() + COOLDOWN_24H);
            break; 
          }

          if (isRateLimit) {
            console.warn(`[KeyManager] Key ${provider} (${apiKey.substring(0, 8)}...) chạm giới hạn RPM (tần suất/phút). Tạm nghỉ 60s & chuyển key kế tiếp...`);
            this.updateKeyStatus(provider, apiKey, 'LIMITED_RPM', Date.now() + 60 * 1000);
            break; 
          }

          if (isInvalidKey) {
            console.error(`[KeyManager] Key ${provider} sai hoặc bị chặn. Chặn key...`);
            this.updateKeyStatus(provider, apiKey, 'BLOCKED');
            break; 
          }

          if (provider === 'nvidia') {
            if (isTransient || isRateLimit) {
              console.warn(`[KeyManager] NVIDIA: Bỏ qua cơ chế hãm tốc độ. Fail-fast để đẩy luồng tối đa.`);
              throw error; // Quăng lỗi lập tức, không dùng setTimeout ngâm request.
            }
          }

          if (isTransient || isRateLimit) {
            if (attempt > MAX_RETRIES) {
              console.warn(`[KeyManager] Key ${provider} lỗi liên tục sau ${MAX_RETRIES} lần thử. Phạt khóa 2 phút (RPM).`);
              this.updateKeyStatus(provider, apiKey, 'LIMITED_RPM', Date.now() + COOLDOWN_2M);
              break;
            } else {
              const delay = BACKOFF_BASE * Math.pow(2, attempt - 1); 
              console.warn(`[KeyManager] Lỗi mạng tạm thời / Rate Limit (${status}) của ${provider}. Đợi ${delay}ms để thử lại... (Lần ${attempt}/${MAX_RETRIES})`);
              await new Promise(resolve => setTimeout(resolve, delay));
              attempt++;
              continue; 
            }
          }

          throw error; // Other non-transient errors
        }
      }
    }
  }
}

export const keyManager = new KeyManager();
