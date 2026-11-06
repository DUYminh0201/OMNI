// PoC: downloadUrls.js + taskParser.js
import { buildFreshDownloadUrl } from '../resources/mkt-flow/apps/marketing-flow-desktop/server/downloadUrls.js';
import { parseTask, TASK_TYPES, TASK_TO_COMPETENCY } from '../resources/mkt-flow/apps/marketing-flow-desktop/src/utils/orchestrator/taskParser.js';

console.log('=== buildFreshDownloadUrl ===');
for (const [fn, v] of [['a.mp4', 123], ['a b.mp4', 123], ['../../etc/passwd', 1],
                       ['..\\..\\win.ini', 1], ['a/b.mp4', 1], ['<script>.mp4', 1],
                       ['tệp.mp4', 1], ['', 1], [undefined, 1], [null, 1],
                       ['x'.repeat(300) + '.mp4', 1]]) {
  let r; try { r = buildFreshDownloadUrl(fn, v); } catch (e) { r = 'THROW: ' + e.message; }
  console.log(`${JSON.stringify(String(fn).slice(0, 30)).padEnd(34)} -> ${r}`);
}
console.log('\n--- header-injection / CRLF check ---');
for (const fn of ['a\r\nX-Injected: 1.mp4', 'a\nfoo.mp4']) {
  console.log(JSON.stringify(fn), '->', JSON.stringify(buildFreshDownloadUrl(fn, 1)));
}

console.log('\n=== parseTask ===');
console.log('TASK_TYPES =', JSON.stringify(TASK_TYPES, null, 0));
console.log('\n--- tổng trọng số từng task type (phải = 1.0) ---');
for (const t of Object.values(TASK_TYPES)) {
  const p = parseTask(t, {});
  const { quality, speed, cost } = p.weights;
  const sum = quality + speed + cost;
  console.log(`${t.padEnd(18)} q=${quality} s=${speed} c=${cost} sum=${sum}${sum !== 1 ? '  <-- KHÁC 1.0' : ''} competency=${p.competency}`);
}
console.log('\n--- task type KHÔNG có trong TASK_WEIGHTS (fallback) ---');
for (const t of ['unknown_type', '', undefined, null, 'constructor', 'toString', '__proto__']) {
  const p = parseTask(t, {});
  console.log(`${JSON.stringify(t).padEnd(20)} weights=${JSON.stringify(p.weights)} competency=${p.competency} type=${JSON.stringify(p.type)}`);
}

console.log('\n--- constraints ---');
for (const [t, payload] of [
  ['audio_stt', {}], ['audio_tts', { audio: 1 }], ['vision_analysis', {}],
  ['translation', { image: 1 }], ['translation', { prompt: 'x'.repeat(400) }],
  ['bulk_content', { count: 5 }], ['bulk_content', { count: 1 }], ['structured_json', {}],
]) {
  const p = parseTask(t, payload);
  console.log(`${t.padEnd(16)} payload=${JSON.stringify(Object.keys(payload)).padEnd(20)} -> ${JSON.stringify(p.constraints)} complexity=${p.complexity}`);
}

console.log('\n--- prompt_tokens biên ---');
for (const len of [0, 1, 4, 3200, 3201]) {
  const p = parseTask('translation', { prompt: 'a'.repeat(len) });
  console.log(`promptLen=${String(len).padEnd(5)} prompt_tokens=${String(p.constraints.prompt_tokens).padEnd(5)} complexity=${p.complexity}`);
}

console.log('\n--- payload kỳ lạ / null ---');
for (const payload of [undefined, null, 'string', 42, { prompt: null }, { count: 'abc' }, { count: -5 }]) {
  let r; try { r = JSON.stringify(parseTask('translation', payload)); } catch (e) { r = 'THROW: ' + e.message; }
  console.log(`${JSON.stringify(payload).padEnd(24)} -> ${r}`);
}

console.log('\n=== TASK_TO_COMPETENCY coverage ===');
for (const t of Object.values(TASK_TYPES)) {
  console.log(`${t.padEnd(18)} -> ${TASK_TO_COMPETENCY[t] ?? '(THIẾU - fallback reasoning)'}`);
}
