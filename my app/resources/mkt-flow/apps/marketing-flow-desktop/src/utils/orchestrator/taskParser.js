/**
 * taskParser.js
 * Orchestrator — Thành phần 2: Task Parser & Classifier
 *
 * Phân loại task và xác định trọng số ưu tiên (quality/speed/cost).
 */

export const TASK_TYPES = {
  VISION_ANALYSIS:  'vision_analysis',   // Phân tích ảnh sản phẩm
  TRANSLATION:      'translation',        // Dịch Khmer, tóm tắt text
  STRUCTURED_JSON:  'structured_json',    // Báo cáo JSON cuối
  BULK_CONTENT:     'bulk_content',       // Tạo content hàng loạt
  VIDEO_TRANSLATE:  'video_translate',    // Dịch phụ đề video
  AUDIO_STT:        'audio_stt',          // Speech-to-text (chỉ Gemini)
  AUDIO_TTS:        'audio_tts',          // Text-to-speech (chỉ Gemini)
};

// Trọng số ưu tiên cho từng loại task (W_quality + W_speed + W_cost = 1.0)
const TASK_WEIGHTS = {
  [TASK_TYPES.VISION_ANALYSIS]:  { quality: 0.6, speed: 0.3, cost: 0.1 },
  [TASK_TYPES.TRANSLATION]:      { quality: 0.4, speed: 0.4, cost: 0.2 },
  [TASK_TYPES.STRUCTURED_JSON]:  { quality: 0.7, speed: 0.2, cost: 0.1 },
  [TASK_TYPES.BULK_CONTENT]:     { quality: 0.3, speed: 0.3, cost: 0.4 },
  [TASK_TYPES.VIDEO_TRANSLATE]:  { quality: 0.4, speed: 0.4, cost: 0.2 },
  [TASK_TYPES.AUDIO_STT]:        { quality: 0.9, speed: 0.1, cost: 0.0 },
  [TASK_TYPES.AUDIO_TTS]:        { quality: 0.9, speed: 0.1, cost: 0.0 },
};

// Map loại task sang competency key trong registry
export const TASK_TO_COMPETENCY = {
  [TASK_TYPES.VISION_ANALYSIS]:  'vision',
  [TASK_TYPES.TRANSLATION]:      'translation',
  [TASK_TYPES.STRUCTURED_JSON]:  'structured_json',
  [TASK_TYPES.BULK_CONTENT]:     'creative_writing',
  [TASK_TYPES.VIDEO_TRANSLATE]:  'translation',
  [TASK_TYPES.AUDIO_STT]:        'audio',
  [TASK_TYPES.AUDIO_TTS]:        'audio',
};

/**
 * Parse task và trả về thông tin đầy đủ để Scorer xử lý.
 * @param {string} taskType - Loại task từ TASK_TYPES
 * @param {object} payload  - Dữ liệu đầu vào của task
 * @returns {object} parsedTask
 */
export function parseTask(taskType, payload = {}) {
  const hasImage   = !!(payload.image);
  const hasAudio   = !!(payload.audio);
  const promptLen  = (payload.prompt || '').length;
  const needsJson  = !!(payload.responseSchema);
  const isBulk     = (payload.count || 1) > 1;
  const promptTokens = Math.ceil(promptLen / 4);

  // Hard constraints — buộc dùng provider cụ thể
  const mustUseGemini = (
    taskType === TASK_TYPES.AUDIO_STT ||
    taskType === TASK_TYPES.AUDIO_TTS
  );

  // Tính độ phức tạp
  let complexity = 'SIMPLE';
  if (promptLen > 3000) complexity = 'COMPLEX';
  else if (promptLen > 800) complexity = 'MEDIUM';

  return {
    type:       taskType,
    competency: TASK_TO_COMPETENCY[taskType] || 'reasoning',
    weights:    TASK_WEIGHTS[taskType] || { quality: 0.5, speed: 0.3, cost: 0.2 },
    constraints: {
      requires_vision: hasImage || taskType === TASK_TYPES.VISION_ANALYSIS,
      requires_audio:  hasAudio || mustUseGemini,
      requires_json:   needsJson || taskType === TASK_TYPES.STRUCTURED_JSON,
      must_use_gemini: mustUseGemini,
      is_bulk:         isBulk,
      prompt_tokens:   promptTokens,
    },
    complexity,
  };
}
