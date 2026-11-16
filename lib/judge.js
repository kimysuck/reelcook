// AI 채점 (F-J1, 평가 모드 전용): 앱이 만든 레시피가 릴스와 맞는지 기준 4개로 판정한다.
//   채점 AI 둘(A·B)이 서로 모르게 따로 판정 → 둘이 다르게 본 기준만 검토 AI가 릴스를 다시 보고 결정.
//   분석에 쓰는 Flash와 다른 모델을 앞에 둬서, 분석 AI의 실수를 같은 모델이 그대로 맞다고 하는 일을 줄인다.
//   모델 이름은 환경변수(JUDGE_A·JUDGE_B·JUDGE_ARB, 쉼표로 여러 개)로 바꿀 수 있다. 없거나 한도면 다음 모델로.
import { generate, uploadVideo, deleteVideo, videoPart, FILE_URI } from './gemini.js';
import { getReelMeta, downloadVideo, shortcodeOf } from './instagram.js';
import { cacheGet } from './db.js';

const list = (env, def) => (process.env[env] ? process.env[env].split(',').map(s => s.trim()).filter(Boolean) : def);
export const JUDGES = () => ({
  A: list('JUDGE_A', ['gemini-3.1-pro', 'gemini-3.8-flash', 'gemini-3.7-flash']),
  B: list('JUDGE_B', ['gemini-4-carbon', 'gemini-3.6-flash', 'gemini-3.5-flash']),
  ARB: list('JUDGE_ARB', ['gemini-4-argon', 'gemini-3.1-pro', 'gemini-3.8-flash']),
});
export const CRITERIA = [
  ['ingredients', '재료', '영상·캡션·작성자 댓글에 나온 재료가 빠짐없이 있고, 없는 재료를 지어내지 않았다(소금·기름 같은 기본 재료도 화면에 보이면 포함).'],
  ['amounts', '분량', '자료에 숫자가 있으면 그 숫자와 ±30% 또는 숟가락 1개 이내로 맞는다. 자료가 "약간·듬뿍"처럼 말로 말했으면 그 표현을 지켰다. 자료에 분량이 없으면 화면으로 보아 상식적인 범위다.'],
  ['steps', '순서', '단계 순서가 영상의 실제 순서와 같고, 빠진 핵심 단계가 없다.'],
  ['method', '조리 방법', '굽기·볶기·튀기기·삶기·데치기 같은 조리 방법과 불 세기가 영상과 맞다.'],
];
export const RUBRIC_TEXT = '재료 빠짐 없음 · 분량 ±30% 또는 1숟갈 이내(말로 된 분량은 원문 유지) · 단계 순서 · 조리 방법';
const KEYS = CRITERIA.map(c => c[0]);
const parseJ = t => { try { const a = t.indexOf('{'), b = t.lastIndexOf('}'); return JSON.parse(t.slice(a, b + 1)); } catch { return null; } };

// 레시피를 사람이 보는 글로 (채점 AI가 앱 화면과 같은 내용을 보게)
export function recipeText(recipes) {
  return (recipes || []).slice(0, 4).map((r, n) => {
    const ing = (r.ingredients || []).map((i, k) => `${k}. ${i.name} ${i.orig_qty != null ? i.orig_qty : ''}${i.orig_unit || ''}${i.grams ? ` (약 ${i.grams}g)` : i.ml ? ` (약 ${i.ml}ml)` : ''}${i.estimated ? ' [화면 보고 추정]' : ''}`).join('\n');
    const st = (r.steps || []).map((s, k) => `${k + 1}. ${String(s.text || '').replace(/\[\[(\d+)\]\]/g, (m, x) => (r.ingredients[+x] || {}).name || '')}${s.heat ? ` [${s.heat}]` : ''}`).join('\n');
    return `### 레시피 ${n + 1}: ${r.title || ''}\n[재료]\n${ing}\n[만드는 법]\n${st}`;
  }).join('\n\n').slice(0, 12000);
}
function judgePrompt(rtext, caption, comments) {
  return `너는 요리 레시피 채점자다. 아래 [앱이 만든 레시피]가 이 인스타그램 릴스(영상·캡션·작성자 댓글)의 실제 레시피와 맞는지 기준마다 따로 판정하라.
다른 채점자도 같은 일을 하므로, 너는 근거를 영상·캡션에서 직접 확인하고 판단한다. 애매하면 통과로 보지 말고 이유를 적는다.

[채점 기준]
${CRITERIA.map(([k, n, d]) => `- ${k} (${n}): ${d}`).join('\n')}

[작성자 캡션]
"""
${String(caption || '(없음)').slice(0, 4000)}
"""
[작성자 댓글]
${(comments || []).filter(c => /^작성자: /.test(c)).slice(0, 5).join('\n') || '(없음)'}

[앱이 만든 레시피]
${rtext}

출력 JSON(이 키만): {"criteria":{${KEYS.map(k => `"${k}":{"pass":true,"reason":"한 문장","evidence":"영상 시각이나 캡션 문구"}`).join(',')}}}`;
}
function arbPrompt(rtext, caption, A, B, keys) {
  return `너는 요리 레시피 채점의 검토자다. 두 채점자가 아래 기준에서 서로 다르게 판정했다. 릴스(영상·캡션)를 직접 다시 확인해 기준마다 최종 판정을 내리고, 틀린 채점자가 무엇을 놓쳤는지 적어라.

[다르게 판정한 기준]
${keys.map(k => { const c = CRITERIA.find(x => x[0] === k); return `- ${k} (${c[1]}): ${c[2]}\n  채점자 A: ${A[k].pass ? '통과' : '불통과'} — ${A[k].reason || ''}\n  채점자 B: ${B[k].pass ? '통과' : '불통과'} — ${B[k].reason || ''}`; }).join('\n')}

[작성자 캡션]
"""
${String(caption || '(없음)').slice(0, 4000)}
"""
[앱이 만든 레시피]
${rtext}

출력 JSON(이 키만): {"decisions":{${keys.map(k => `"${k}":{"pass":true,"right":"A|B","why":"한 문장"}`).join(',')}}}`;
}
const okJudge = t => { const j = parseJ(t); return !!(j && j.criteria && KEYS.every(k => j.criteria[k] && typeof j.criteria[k].pass === 'boolean')); };
const JSONC = { responseMimeType: 'application/json' };

// 서버 작업 한 단계. 시간이 모자라면 지금까지(영상 주소·A·B)를 넘기고 이어서 한다. 반환 모양은 run()과 같다.
export async function runJudge(body, emit, t0, deadline, meter) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { status: 500, json: { error: 'no_key' } };
  const S = { ...(body.state || {}) }, hop = body.hop || 0, notes = [];
  const left = () => deadline - (Date.now() - t0);
  const link = String(body.link || ''), rtext = recipeText(body.recipes);
  const cont = () => hop >= 4 ? { status: 504, json: { error: 'judge_too_long', notes } } : ({ status: 200, json: { continue: true, hop: hop + 1, resume: S, notes } });
  // ① 자료: 분석 캐시의 캡션·영상 주소를 먼저 쓰고, 영상을 못 받으면 릴스 정보를 다시 가져온다
  if (!S.file) {
    emit({ stage: 'judge_fetch' });
    const hit = await cacheGet(shortcodeOf(link)).catch(() => null);
    S.caption = (hit && hit.source && hit.source.caption) || ''; S.comments = (hit && hit.source && hit.source.comments) || [];
    let raw = hit && hit.video_url ? await downloadVideo(hit.video_url, notes) : null;
    if (!raw) { const m = await getReelMeta(link).catch(() => null); if (m) { S.caption = S.caption || m.caption; S.comments = (m.comments || []).map(c => (c.owner ? '작성자: ' : '') + c.text); raw = m.videoUrl ? await downloadVideo(m.videoUrl, notes) : null; } }
    if (raw) { const up = await uploadVideo(key, raw.buf, raw.mime, left); if (up.uri) S.file = { uri: up.uri, name: up.name, mime: up.mime }; else notes.push(up.err); }
    if (!S.file) S.file = { none: true };   // 영상 없이 캡션으로만 채점
  }
  const parts = p => [{ text: p }, ...(S.file && S.file.uri ? [videoPart(S.file, null)] : [])];
  const J = JUDGES();
  for (const who of ['A', 'B']) {
    if (S[who]) continue;
    if (left() < 60000) return cont();
    emit({ stage: 'judge_' + who.toLowerCase() });
    const r = await generate({ key, models: J[who], cfgs: [{ gen: { ...JSONC, thinkingConfig: { thinkingLevel: 'low' }, mediaResolution: 'MEDIA_RESOLUTION_MEDIUM' } }, { gen: JSONC }],
      buildParts: () => parts(judgePrompt(rtext, S.caption, S.comments)), validate: okJudge, emit: () => {}, left, log: notes, meter });
    if (!r.ok) { if (r.reason === 'too_long') return cont(); return { status: 502, json: { error: 'judge_' + (r.reason || 'error'), notes } }; }
    const j = parseJ(r.text); if (!okJudge(r.text)) return { status: 502, json: { error: 'judge_parse', notes } };
    S[who] = { model: r.model, criteria: j.criteria };
  }
  // ② 둘이 다르게 본 기준만 검토 AI가 결정
  const A = S.A.criteria, B = S.B.criteria, split = KEYS.filter(k => A[k].pass !== B[k].pass);
  if (split.length && !S.ARB) {
    if (left() < 60000) return cont();
    emit({ stage: 'judge_arb' });
    const r = await generate({ key, models: J.ARB, cfgs: [{ gen: { ...JSONC, thinkingConfig: { thinkingLevel: 'medium' } } }, { gen: JSONC }],
      buildParts: () => parts(arbPrompt(rtext, S.caption, A, B, split)), validate: t => { const j = parseJ(t); return !!(j && j.decisions && split.every(k => j.decisions[k])); }, emit: () => {}, left, log: notes, meter });
    if (!r.ok) { if (r.reason === 'too_long') return cont(); return { status: 502, json: { error: 'judge_arb_' + (r.reason || 'error'), notes } }; }
    S.ARB = { model: r.model, decisions: parseJ(r.text).decisions };
  }
  if (S.file && S.file.name) await deleteVideo(key, S.file.name);
  const criteria = Object.fromEntries(KEYS.map(k => {
    const d = S.ARB && S.ARB.decisions[k];
    return [k, { pass: d ? !!d.pass : A[k].pass, a: A[k].pass, b: B[k].pass, arb: d ? (d.right === 'A' || d.right === 'B' ? d.right : '?') : null,
      reason: d ? d.why : (A[k].pass ? '' : A[k].reason || B[k].reason || '') }];
  }));
  return { status: 200, json: { judge: { criteria, pass: KEYS.every(k => criteria[k].pass), agree: KEYS.length - split.length, split: split.length,
    models: { A: S.A.model, B: S.B.model, ARB: S.ARB ? S.ARB.model : null }, video: !!(S.file && S.file.uri) }, notes } };
}
