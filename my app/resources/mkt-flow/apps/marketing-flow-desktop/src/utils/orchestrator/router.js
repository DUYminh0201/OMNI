/**
 * router.js
 * Orchestrator — Thành phần 4: Router
 *
 * Tổng hợp Registry + Parser + Scorer để chọn model tối ưu.
 * Xuất agentPool cho Market Intelligence và Video Dubbing.
 */

import { getAvailableModels, getUnusableModels } from './model_db.js';
import { parseTask, TASK_TYPES }                  from './taskParser.js';
import { scoreModels }                             from './scorer.js';

// Registry data — được load từ server qua API hoặc bundle vào
let _registryCache = null;

/**
 * Load registry từ backend API (gọi 1 lần, cache lại).
 */
async function loadRegistry() {
  if (_registryCache) return _registryCache;
  try {
    const resp = await fetch('/api/model-registry');
    if (resp.ok) {
      _registryCache = await resp.json();
      return _registryCache;
    }
  } catch (e) {
    console.warn('[Orchestrator] Không load được registry từ server, dùng localStorage fallback.');
  }
  // Fallback: thử lấy từ localStorage (nếu đã cache trước đó)
  try {
    const cached = localStorage.getItem('ai_orchestrator_registry');
    if (cached) { _registryCache = JSON.parse(cached); return _registryCache; }
  } catch { /* bỏ qua */ }
  return null;
}

/**
 * Chọn model tốt nhất cho một loại task.
 * @param {string} taskType  - Từ TASK_TYPES
 * @param {object} payload   - Payload tùy chọn để tính constraints
 * @param {Array}  available - Danh sách model từ getAvailableModels()
 * @returns {{ primary, fallback, ranked }}
 */
function resolveAgent(taskType, payload, available) {
  const parsedTask = parseTask(taskType, payload);
  const ranked     = scoreModels(parsedTask, available);
  
  const primary = ranked[0] || available[0];
  if (!primary) throw new Error('Chưa có model AI hợp lệ. Hãy cấu hình API key và tải lại danh sách model.');

  // Fallback: Ưu tiên chọn model từ provider KHÁC với primary để chống chết chùm (Rate Limit)
  let fallback = ranked.find(m => m.provider !== primary.provider && m.modelId !== primary.modelId);
  if (!fallback) fallback = ranked[1] || null;

  return {
    primary,
    fallback,
    ranked,
    task: parsedTask,
  };
}

/**
 * Xây dựng AgentPool đầy đủ cho Market Intelligence.
 * Trả về: { slots, unusable, summary }
 */
export async function buildMIAgentPool(payload = {}) {
  const registry  = await loadRegistry();
  const available = await getAvailableModels(registry);
  const unusable  = await getUnusableModels();

  const visionAgent      = resolveAgent(TASK_TYPES.VISION_ANALYSIS, payload, available);
  const translationAgent = resolveAgent(TASK_TYPES.TRANSLATION,     payload, available);
  const jsonAgent        = resolveAgent(TASK_TYPES.STRUCTURED_JSON, payload, available);

  const slots = {
    vision: {
      primary:  visionAgent.primary,
      fallback: visionAgent.fallback,
      label:    'Agent Phân Tích Ảnh',
      step:     1,
    },
    fast_text: {
      primary:  translationAgent.primary,
      fallback: translationAgent.fallback,
      label:    'Agent Dịch Khmer',
      step:     2,
    },
    json_report: {
      primary:  jsonAgent.primary,
      fallback: jsonAgent.fallback,
      label:    'Agent Báo Cáo',
      step:     4,
    },
  };

  // Summary text cho UI
  const summary = Object.entries(slots).map(([key, slot]) => ({
    key,
    label:     slot.label,
    modelId:   slot.primary.modelId,
    provider:  slot.primary.provider,
    display:   slot.primary.displayName,
    reason:    slot.primary.reason || '',
    score:     slot.primary.finalScore || 0,
  }));

  return { slots, unusable, summary, available };
}

/**
 * Xây dựng AgentPool cho Video Dubbing.
 */
export async function buildDubbingAgentPool(payload = {}) {
  const registry  = await loadRegistry();
  const available = await getAvailableModels(registry);

  const sttAgent       = resolveAgent(TASK_TYPES.AUDIO_STT,       payload, available);
  const translateAgent = resolveAgent(TASK_TYPES.VIDEO_TRANSLATE,  payload, available);
  const ttsAgent       = resolveAgent(TASK_TYPES.AUDIO_TTS,        payload, available);

  return {
    slots: {
      stt:       { primary: sttAgent.primary,       label: 'Agent Nhận Diện Giọng Nói', step: 1 },
      translate: { primary: translateAgent.primary,  label: 'Agent Dịch Phụ Đề',         step: 2 },
      tts:       { primary: ttsAgent.primary,        label: 'Agent Tổng Hợp Giọng Nói',  step: 3 },
    },
    summary: [
      { key: 'stt',       label: 'Nhận diện giọng nói', modelId: sttAgent.primary.modelId,       provider: sttAgent.primary.provider,       display: sttAgent.primary.displayName },
      { key: 'translate', label: 'Dịch phụ đề',         modelId: translateAgent.primary.modelId, provider: translateAgent.primary.provider, display: translateAgent.primary.displayName },
      { key: 'tts',       label: 'Tổng hợp tiếng',      modelId: ttsAgent.primary.modelId,       provider: ttsAgent.primary.provider,       display: ttsAgent.primary.displayName },
    ],
  };
}

/**
 * Serialize agentPool thành format gửi lên server.
 * Mỗi slot chỉ gửi thông tin cần thiết (không gửi ranked array).
 */
export function serializeAgentPool(agentPool) {
  const serialized = {};
  for (const [key, slot] of Object.entries(agentPool.slots || {})) {
    serialized[key] = {
      provider:  slot.primary.provider,
      model:     slot.primary.modelId,
      nvidiaKey: slot.primary.nvidiaKey || null,
      // fallback
      fallback_provider: slot.fallback?.provider,
      fallback_model:    slot.fallback?.modelId,
      fallback_nvidiaKey: slot.fallback?.nvidiaKey || null,
    };
  }
  return serialized;
}
