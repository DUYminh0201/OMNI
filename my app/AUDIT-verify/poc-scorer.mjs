// PoC: scorer.js — does the +10 bonus REVERSE the ranking?
// scorer.js reads localStorage at call time; we install a stub global.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { parseTask } = await import('../resources/mkt-flow/apps/marketing-flow-desktop/src/utils/orchestrator/taskParser.js');
const { scoreModels } = await import('../resources/mkt-flow/apps/marketing-flow-desktop/src/utils/orchestrator/scorer.js');

// Re-implement the formula WITHOUT the +10 bonus to compare.
function scoreWithoutBonus(parsedTask, models) {
  const { competency, weights } = parsedTask;
  return models.map(m => {
    const S_quality = m.competencies?.[competency] ?? 70;
    const S_speed = m.speed_score || 75;
    const S_cost = m.cost_score || 75;
    const s = weights.quality * S_quality + weights.speed * S_speed + weights.cost * S_cost;
    return { modelId: m.modelId, provider: m.provider, noBonus: Math.round(s * 10) / 10 };
  }).sort((a, b) => b.noBonus - a.noBonus);
}

function run(title, parsedTask, models) {
  const withBonus = scoreModels(parsedTask, models).map(m => ({ id: m.modelId, p: m.provider, s: m.finalScore }));
  const noBonus = scoreWithoutBonus(parsedTask, models);
  console.log(`\n### ${title}`);
  console.log('weights =', JSON.stringify(parsedTask.weights), 'competency =', parsedTask.competency);
  console.log('--- KHÔNG bonus (tính tay) ---');
  noBonus.forEach((r, i) => console.log(`  #${i + 1} ${r.modelId.padEnd(22)} ${r.p.padEnd(8)} ${r.noBonus}`));
  console.log('--- CÓ bonus +10 (scorer.js thật) ---');
  withBonus.forEach((r, i) => console.log(`  #${i + 1} ${r.id.padEnd(22)} ${r.p.padEnd(8)} ${r.s}`));
  const w1 = noBonus[0], b1 = withBonus[0];
  const flipped = w1.modelId !== b1.id;
  console.log(`>>> Người thắng KHÔNG bonus: ${w1.modelId} (${w1.noBonus})`);
  console.log(`>>> Người thắng CÓ bonus  : ${b1.id} (${b1.s})`);
  console.log(`>>> ĐẢO NGƯỢC KẾT QUẢ? ${flipped ? 'CÓ *** ĐẢO NGƯỢC ***' : 'KHÔNG'}`);
  return { flipped, noBonus, withBonus };
}

const parsed = parseTask('translation', { prompt: 'dịch đoạn ngắn' });

// Case A: Gemini clearly better on quality, but only by a small margin.
const modelsA = [
  { modelId: 'gemini-2.5-pro', provider: 'gemini', competencies: { translation: 88 }, speed_score: 80, cost_score: 70, context_window: 1000000 },
  { modelId: 'nvidia-llama', provider: 'nvidia', competencies: { translation: 84 }, speed_score: 80, cost_score: 70, context_window: 128000 },
];
run('A. Gemini 88 vs Nvidia 84 (chênh 4 điểm quality)', parsed, modelsA);

// Case B: Gemini better by more.
const modelsB = [
  { modelId: 'gemini-2.5-pro', provider: 'gemini', competencies: { translation: 95 }, speed_score: 80, cost_score: 70 },
  { modelId: 'nvidia-llama', provider: 'nvidia', competencies: { translation: 84 }, speed_score: 80, cost_score: 70 },
];
run('B. Gemini 95 vs Nvidia 84 (chênh 11 điểm)', parsed, modelsB);

// Case C: margin search — find the exact quality margin where the flip happens.
console.log('\n### C. Tìm ngưỡng lật (translation, weights q=0.4)');
for (let g = 84; g <= 100; g++) {
  const ms = [
    { modelId: 'gemini', provider: 'gemini', competencies: { translation: g }, speed_score: 80, cost_score: 70 },
    { modelId: 'nvidia', provider: 'nvidia', competencies: { translation: 84 }, speed_score: 80, cost_score: 70 },
  ];
  const w = scoreWithoutBonus(parsed, ms)[0].modelId;
  const b = scoreModels(parsed, ms)[0].modelId;
  if (w !== b) console.log(`  gemini=${g} -> KHÔNG bonus thắng=${w}, CÓ bonus thắng=${b}  <== LẬT`);
}
console.log('  (các mức không in ra là không lật)');

// Case D: bulk_content weights cost=0.4 — nvidia much cheaper.
const parsedBulk = parseTask('bulk_content', { prompt: 'x', count: 10 });
run('D. bulk_content: Gemini chất lượng cao vs Nvidia rẻ', parsedBulk, [
  { modelId: 'gemini-2.5-flash', provider: 'gemini', competencies: { creative_writing: 90 }, speed_score: 85, cost_score: 40 },
  { modelId: 'nvidia-fast', provider: 'nvidia', competencies: { creative_writing: 78 }, speed_score: 85, cost_score: 95 },
]);

// Case E: OpenAI also gets the bonus but buildReason has no OpenAI branch.
const parsedJson = parseTask('structured_json', { prompt: 'y', responseSchema: {} });
run('E. structured_json: Gemini vs OpenAI (buildReason không có nhánh openai)', parsedJson, [
  { modelId: 'gemini-2.5-pro', provider: 'gemini', competencies: { structured_json: 93 }, speed_score: 75, cost_score: 60 },
  { modelId: 'gpt-4o', provider: 'openai', competencies: { structured_json: 90 }, speed_score: 75, cost_score: 60 },
]);
for (const m of scoreModels(parsedJson, [
  { modelId: 'gemini-2.5-pro', provider: 'gemini', competencies: { structured_json: 93 }, speed_score: 75, cost_score: 60 },
  { modelId: 'gpt-4o', provider: 'openai', competencies: { structured_json: 90 }, speed_score: 75, cost_score: 60 },
])) console.log(`  reason[${m.modelId}] = ${m.reason}`);

// Case F: hard constraints still work?
console.log('\n### F. Hard constraints (must_use_gemini / vision / context)');
const audioTask = parseTask('audio_stt', { prompt: 'a', audio: true });
console.log('audio_stt constraints:', JSON.stringify(audioTask.constraints));
console.log('providers sống sót:', scoreModels(audioTask, [
  { modelId: 'gemini', provider: 'gemini', competencies: { audio: 90 } },
  { modelId: 'nvidia', provider: 'nvidia', competencies: { audio: 99 } },
  { modelId: 'openai', provider: 'openai', competencies: { audio: 99 } },
]).map(m => m.modelId));

const visionTask = parseTask('vision_analysis', { prompt: 'v', image: 'x' });
console.log('vision sống sót (chỉ gemini có tag vision):', scoreModels(visionTask, [
  { modelId: 'gemini', provider: 'gemini', tags: ['vision'], competencies: { vision: 80 } },
  { modelId: 'nvidia-blind', provider: 'nvidia', tags: [], competencies: { vision: 99 } },
]).map(m => m.modelId));

// Case G: does the bonus double-count relative to a fair normalization?
console.log('\n### G. Bonus áp dụng cho model KHÔNG có competency (fallback 70)');
const parsedT = parseTask('translation', { prompt: 'z' });
for (const m of scoreModels(parsedT, [
  { modelId: 'gemini-nocomp', provider: 'gemini', competencies: {}, speed_score: 75, cost_score: 75 },
  { modelId: 'nvidia-nocomp', provider: 'nvidia', competencies: {}, speed_score: 75, cost_score: 75 },
])) console.log(`  ${m.modelId.padEnd(18)} quality=${m.scores.quality} final=${m.finalScore} reason=${m.reason}`);
