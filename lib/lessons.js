// 배운 규칙 (v1.14): 채점에서 틀린 것을 일반 규칙으로 정리해 저장하고, 다음 분석부터 AI 지시문에 넣는다.
//   틀린 릴스 하나만 고치는 게 아니라 "비슷한 릴스에서 같은 실수"를 막는 것이 목적이다.
//   ① AI 채점에서 불통과 기준이 나오면 → 학습 AI가 영상·캡션을 직접 다시 보고 실수가 진짜인지 확인
//   ② 진짜면 요리 이름이 없는 일반 규칙 한 문장으로 정리(이미 있는 규칙과 같으면 그 규칙의 횟수만 올림)
//   ③ 분석(api/analyze.js)이 켜진 규칙을 지시문에 넣는다. 규칙이 바뀌면 예전 저장 분석은 새로 분석한다(lv)
//   테스터가 평가 화면에서 규칙을 끌 수 있다. 가벼운 모델(lite)은 판단이 약해서 학습에 쓰지 않는다.
import { generate, MODELS } from './gemini.js';

const URL_ = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = () => process.env.SUPABASE_SECRET_KEY || '';
const H = (x = {}) => { const k = KEY(); return { apikey: k, ...(k.startsWith('eyJ') ? { Authorization: `Bearer ${k}` } : {}), 'Content-Type': 'application/json', ...x }; };
const T = () => `${URL_()}/rest/v1/analysis_lessons`;
export const MAX_ACTIVE = 30;
export const LEARN_MODELS = () => MODELS.filter(m => !/lite/.test(m));

let memo = { at: 0, list: [] };
// 켜진 규칙 (1분 기억). 표가 없거나 오류면 빈 목록 → 분석은 예전처럼
export async function activeLessons(fresh = false) {
  if (!URL_() || !KEY()) return [];
  if (!fresh && Date.now() - memo.at < 60_000) return memo.list;
  try {
    const r = await fetch(`${T()}?active=eq.true&select=id,rule,kind,hits&order=id.asc&limit=${MAX_ACTIVE}`, { headers: H() });
    memo = { at: Date.now(), list: r.ok ? await r.json() : [] };
  } catch { memo = { at: Date.now(), list: [] }; }
  return memo.list;
}
// 규칙 묶음의 버전: 켜진 규칙 번호를 이어 붙인 값. 저장된 분석이 다른 버전이면 새로 분석한다
export const lessonVersion = list => list.map(l => l.id).join('.');
export const lessonBlock = list => list.length
  ? `\n[지난 채점에서 배운 규칙 — 같은 실수를 반복하지 않도록 반드시 지킨다]\n${list.map(l => `- ${l.rule}`).join('\n')}\n`
  : '';

export async function listLessons() {
  if (!URL_() || !KEY()) return null;
  try { const r = await fetch(`${T()}?select=*&order=id.desc&limit=100`, { headers: H() }); return r.ok ? await r.json() : null; } catch { return null; }
}
export async function setLesson(id, active) {
  const r = await fetch(`${T()}?id=eq.${+id}`, { method: 'PATCH', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify({ active: !!active }) });
  memo.at = 0; return r.ok;
}
async function insert(row) {
  const r = await fetch(T(), { method: 'POST', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify(row) });
  return r.ok ? (await r.json())[0] : null;
}
async function bump(l, code) {
  await fetch(`${T()}?id=eq.${+l.id}`, { method: 'PATCH', headers: H(), body: JSON.stringify({ hits: (l.hits || 1) + 1, last_code: code, active: true }) });
}
// 켜진 규칙이 너무 많으면 가장 덜 쓰인(오래된) 규칙부터 끈다 → 지시문이 길어져 AI가 흐려지지 않게
async function trim() {
  const r = await fetch(`${T()}?active=eq.true&select=id,hits&order=hits.asc,id.asc`, { headers: H() });
  const list = r.ok ? await r.json() : [];
  for (const l of list.slice(0, Math.max(0, list.length - MAX_ACTIVE))) await setLesson(l.id, false);
}

const parseJ = t => { try { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { return null; } };
const NAMES = { ingredients: '재료', amounts: '분량', steps: '순서', method: '조리 방법', amount: '분량', missing_ing: '재료 빠짐·틀림', wrong_dish: '다른 요리', missing_recipe: '레시피 누락', other: '기타' };

function learnPrompt({ rtext, caption, problems, existing, human }) {
  return `너는 요리 릴스를 레시피로 바꾸는 AI의 품질 담당이다. 아래 [앱이 만든 레시피]에 대해 ${human ? '사람 평가자가' : '채점 AI가'} 틀렸다고 판정한 내용이 있다.
1) 영상·캡션을 직접 확인해 그 지적이 정말 맞는지 판단한다(채점이 틀렸을 수도 있다. 확실하지 않으면 real=false).
2) 정말 틀렸다면, 레시피를 만드는 AI가 "다른 비슷한 릴스"에서도 같은 실수를 하지 않게 할 일반 규칙을 한 문장(80자 이내, 한국어)으로 쓴다.
   - 요리 이름·재료 이름 하나에만 맞는 규칙은 안 된다. 상황(예: 에어프라이어·오븐 조리, 분량이 범위로 적힌 경우, 영상만 있는 릴스)을 조건으로 쓴다.
   - "~하면 ~한다" 꼴로, 무엇을 해야 하는지 분명하게.
3) [이미 있는 규칙]과 뜻이 같으면 새로 만들지 말고 same에 그 번호를 쓴다.

[틀렸다는 지적]
${problems.map(p => `- ${NAMES[p.k] || p.k}: ${p.reason || '(이유 없음)'}`).join('\n')}

[이미 있는 규칙]
${existing.length ? existing.map(l => `#${l.id} ${l.rule}`).join('\n') : '(없음)'}

[작성자 캡션]
"""
${String(caption || '(없음)').slice(0, 3000)}
"""
[앱이 만든 레시피]
${rtext}

출력 JSON(이 키만): {"real":true,"why":"한 문장","rule":"","kind":"ingredients|amounts|steps|method|other","same":null}`;
}

// 틀린 내용으로 규칙을 배운다. parts(p)는 지시문에 영상을 붙여 주는 함수(채점 작업이 이미 올린 영상 재사용)
export async function learn({ key, code, rtext, caption, problems, human = false, parts, left, log, meter }) {
  if (!URL_() || !KEY() || !problems.length) return { skipped: 'none' };
  const existing = await activeLessons(true);
  const r = await generate({ key, models: LEARN_MODELS(), cfgs: [{ gen: { responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'medium' }, mediaResolution: 'MEDIA_RESOLUTION_MEDIUM' } }, { gen: { responseMimeType: 'application/json' } }],
    buildParts: () => parts(learnPrompt({ rtext, caption, problems, existing, human })), validate: t => { const j = parseJ(t); return !!(j && typeof j.real === 'boolean'); }, emit: () => {}, left, log, meter });
  if (!r.ok) return { skipped: r.reason === 'too_long' ? 'too_long' : 'ai_' + (r.reason || 'error') };
  const j = parseJ(r.text) || {};
  if (!j.real) return { skipped: 'not_real', why: String(j.why || '').slice(0, 200) };
  const same = existing.find(l => l.id === +j.same);
  if (same) { await bump(same, code); memo.at = 0; return { same: same.id, rule: same.rule }; }
  const rule = String(j.rule || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (rule.length < 8) return { skipped: 'no_rule' };
  const row = await insert({ rule, kind: String(j.kind || 'other').slice(0, 20), source: human ? 'human' : 'judge', first_code: code, last_code: code, why: String(j.why || '').slice(0, 300), model: r.model, active: true, hits: 1 });
  await trim().catch(() => {}); memo.at = 0;
  return row ? { added: row.id, rule } : { skipped: 'db' };
}
