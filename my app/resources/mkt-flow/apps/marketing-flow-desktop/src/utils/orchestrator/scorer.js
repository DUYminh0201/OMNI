/**
 * scorer.js
 * Orchestrator — Thành phần 3: Decision Matrix & Weighted Scoring
 *
 * Chấm điểm tổng hợp cho từng model và xếp hạng theo task.
 * Công thức: Score = (W_quality × S_quality) + (W_speed × S_speed) + (W_cost × S_cost)
 */

// Lấy điểm penalty từ feedback của user (localStorage)
function getFeedbackPenalty(modelId, taskType) {
  try {
    const raw = localStorage.getItem(`penalty_${modelId}_${taskType}`);
    return parseInt(raw || '0', 10);
  } catch {
    return 0;
  }
}

// Tạo text giải thích lý do chọn (hiển thị trong OrchestratorStatus UI)
function buildReason(model, competency, sq, ss, sc, weights) {
  if (model.constraints?.must_use_gemini) return 'Bắt buộc dùng Gemini (Audio)';
  if (model.provider === 'nvidia' && sc >= 95) {
    if (ss >= 90) return '⚡ Nvidia · Nhanh + Không giới hạn quota';
    return '💰 Nvidia · Tiết kiệm quota tối đa';
  }
  if (sq >= 90 && weights.quality >= 0.6) return `🏆 Điểm ${competency} cao nhất`;
  if (ss >= 90 && weights.speed >= 0.4) return '🚀 Tốc độ phản hồi nhanh nhất';
  return '✅ Điểm tổng hợp tốt nhất';
}

/**
 * Chấm điểm và xếp hạng tất cả model có sẵn cho một task cụ thể.
 *
 * @param {object} parsedTask - Kết quả từ parseTask()
 * @param {Array}  availableModels - Danh sách từ getAvailableModels()
 * @returns {Array} Danh sách model đã xếp hạng (cao → thấp)
 */
export function scoreModels(parsedTask, availableModels) {
  const { competency, weights, constraints } = parsedTask;

  return availableModels
    .filter(m => {
      // Hard constraint 1: Task yêu cầu audio → chỉ Gemini
      if (constraints.must_use_gemini && m.provider !== 'gemini') return false;

      // Hard constraint 2: Task yêu cầu vision → cần model hỗ trợ vision
      if (constraints.requires_vision) {
        const hasVision = m.tags?.includes('vision') || m._classify?.canVision;
        if (!hasVision) return false;
      }

      // Hard constraint 3: Context window đủ lớn
      if (constraints.prompt_tokens > 0 && m.context_window) {
        if (constraints.prompt_tokens > m.context_window * 0.8) return false;
      }

      return true;
    })
    .map(m => {
      // Tính điểm quality cho competency cụ thể
      const rawQuality = m.competencies?.[competency] || m.competencies?.translation || 70;
      const feedbackPenalty = getFeedbackPenalty(m.modelId, parsedTask.type);
      const S_quality = Math.max(0, rawQuality - feedbackPenalty);
      const S_speed   = m.speed_score || 75;
      const S_cost    = m.cost_score  || 75;

      // Công thức tổng hợp
      let finalScore =
        (weights.quality * S_quality) +
        (weights.speed   * S_speed)   +
        (weights.cost    * S_cost);

      return {
        ...m,
        scores: {
          quality: S_quality,
          speed:   S_speed,
          cost:    S_cost,
          final:   Math.round(finalScore * 10) / 10,
        },
        finalScore: Math.round(finalScore * 10) / 10,
        reason: buildReason(m, competency, S_quality, S_speed, S_cost, weights),
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}
