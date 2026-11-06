/**
 * model_db.js
 * Orchestrator — Thành phần 1: AI Model Registry
 *
 * Đọc registry baseline + kho model thực tế của user.
 * Nvidia models được đọc từ /api/nvidia-models (backend) để tương thích
 * cả Electron app lẫn dev server.
 */

// ── 1. Phân loại model Nvidia theo tên ────────────────────────────────────
export function classifyNvidiaModel(modelId) {
  const id = (modelId || '').toLowerCase();

  // ❌ BLACKLIST: Không bao giờ dùng cho text generation
  if (/diffusion|embed(-v)?\b|sdxl|stable-diff|flux|dall-e|image-gen|text-to-image/.test(id))
    return { canText: false, canVision: false, type: 'UNUSABLE' };

  // ❌ Code-only
  if (/deepseek-coder|codestral|\bcode-v\d/.test(id))
    return { canText: false, canVision: false, type: 'CODE_LLM' };

  // ✅ Vision + Text
  if (/vision|vlm|phi-3.*vision|llava|pixtral|neva/.test(id))
    return { canText: true, canVision: true, type: 'VISION_LLM' };

  // ✅ Reasoning models
  if (/deepseek-r1|qwq|o1-mini|\breflection\b/.test(id))
    return { canText: true, canVision: false, type: 'REASONING_LLM' };

  // ✅ Instruction-following LLMs
  if (/instruct|chat|-it\b|llama|mistral|qwen|kimi|minimax|nemotron|gemma.*it|mixtral|deepseek-v\d|phi-\d(?!.*vision)/.test(id))
    return { canText: true, canVision: false, type: 'INSTRUCTION_LLM' };

  // ⚠️ Không nhận diện → bỏ qua
  return { canText: false, canVision: false, type: 'UNKNOWN' };
}

// ── 2. Lấy profile từ registry ────────────────────────────────────────────
function getModelProfile(modelId, registryData) {
  if (registryData?.models?.[modelId]) return registryData.models[modelId];

  const keys = Object.keys(registryData?.models || {});
  const partialMatch = keys.find(k => modelId.includes(k) || k.includes(modelId));
  if (partialMatch) return registryData.models[partialMatch];

  const cls = classifyNvidiaModel(modelId);
  const defaults = registryData?.default_profiles || {};
  return defaults[cls.type] || {
    translation: 75, structured_json: 70, vision: 0,
    reasoning: 70, creative_writing: 72,
    speed_score: 80, cost_score: 99,
  };
}

// ── 3. Xây dựng danh sách model có sẵn từ kho của user ────────────────────
export async function getAvailableModels(registryData) {
  // Nvidia: đọc từ backend API (ưu tiên), fallback localStorage
  let nvidiaRaw = [];
  try {
    const resp = await fetch('/api/nvidia-models');
    if (resp.ok) nvidiaRaw = await resp.json();
  } catch { /* ignore */ }
  if (nvidiaRaw.length === 0) {
    try { nvidiaRaw = JSON.parse(localStorage.getItem('marketing_nvidia_custom_models') || '[]'); }
    catch { nvidiaRaw = []; }
  }

  // Gemini: từ localStorage
  const geminiRaw = (() => {
    try { return JSON.parse(localStorage.getItem('gemini_api_models') || '[]'); }
    catch { return []; }
  })();

  // OpenAI: dùng trạng thái key đã đồng bộ từ backend
  const hasOpenAI = (() => {
    try {
      const configured = JSON.parse(localStorage.getItem('marketing_configured_providers') || '[]');
      return Array.isArray(configured) && configured.includes('openai');
    }
    catch { return false; }
  })();

  const models = [];

  // ── Gemini models ──────────────────────────────────────────────────────
  geminiRaw.forEach(m => {
    const modelId = m.value || m.id || m;
    const profile = getModelProfile(modelId, registryData);
    models.push({
      modelId, provider: 'gemini',
      displayName: m.label || modelId,
      competencies: profile.competencies || profile,
      speed_score: profile.speed_score || 85,
      cost_score:  profile.cost_score  || 85,
      tags: profile.tags || ['native_google'],
      context_window: profile.context_window || 1048576,
    });
  });

  // ── OpenAI models ──────────────────────────────────────────────────────
  if (hasOpenAI) {
    ['gpt-4o-mini', 'gpt-4o'].forEach(modelId => {
      const profile = getModelProfile(modelId, registryData);
      models.push({
        modelId, provider: 'openai',
        displayName: registryData?.models?.[modelId]?.display_name || modelId,
        competencies: profile.competencies || profile,
        speed_score: profile.speed_score || 85,
        cost_score:  profile.cost_score  || 80,
        tags: profile.tags || ['json', 'balanced'],
        context_window: profile.context_window || 128000,
      });
    });
  }

  // ── Nvidia models ──────────────────────────────────────────────────────
  nvidiaRaw.forEach(item => {
    const modelId = item.model;
    const cls = classifyNvidiaModel(modelId);
    if (!cls.canText && !cls.canVision) {
      console.log(`[Orchestrator] Skip ${modelId} (${cls.type})`);
      return;
    }
    const profile = getModelProfile(modelId, registryData);
    models.push({
      modelId, provider: 'nvidia',
      displayName: registryData?.models?.[modelId]?.display_name || modelId,
      nvidiaKey: item.key,
      competencies: profile.competencies || profile,
      speed_score: profile.speed_score || 88,
      cost_score:  profile.cost_score  || 99,
      tags: profile.tags || ['instruction_llm', 'unlimited_quota'],
      context_window: profile.context_window || 32768,
      _classify: cls,
    });
  });

  return models;
}

// ── 4. Lấy danh sách model bị loại ────────────────────────────────────────
export async function getUnusableModels() {
  let nvidiaRaw = [];
  try {
    const resp = await fetch('/api/nvidia-models');
    if (resp.ok) nvidiaRaw = await resp.json();
  } catch {
    try { nvidiaRaw = JSON.parse(localStorage.getItem('marketing_nvidia_custom_models') || '[]'); } catch { /* Keep the empty fallback list. */ }
  }

  return nvidiaRaw
    .map(item => ({ ...item, cls: classifyNvidiaModel(item.model) }))
    .filter(item => !item.cls.canText && !item.cls.canVision)
    .map(item => ({
      model: item.model, type: item.cls.type,
      reason: item.cls.type === 'UNUSABLE' ? 'Model không sinh được text (diffusion/embedding)'
            : item.cls.type === 'CODE_LLM'  ? 'Model chuyên code, không phù hợp dịch thuật'
            : 'Không nhận diện được loại model',
    }));
}
