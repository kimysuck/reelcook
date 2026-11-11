// Gemini 호출 공통 모듈
// - 무료 한도는 "모델마다 따로"라서, 한 모델이 붐비거나(503) 한도가 차면(429) 바로 다음 모델로 넘어간다.
// - 붐빈 모델은 잠시, 하루 한도가 찬 모델은 초기화 시각까지 건너뛴다.
// - 모든 호출은 ai_usage 표에 기록된다 (설정 > AI 사용량).
import { bumpUsage, todayUsage, nextReset } from './usage.js';

export const MODELS = [...new Set([process.env.GEMINI_MODEL,
  'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite',
].filter(Boolean))];

const cool = new Map(); // model → 다시 써도 되는 시각 (같은 서버 인스턴스 안에서 기억)
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callOnce(key, model, parts, generationConfig, signal) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig }),
  });
  const data = await r.json().catch(() => ({}));
  const text = (data.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
  const u = data.usageMetadata || {};
  return { status: r.status, ok: r.ok, data, text, finish: data.candidates?.[0]?.finishReason || '', tin: u.promptTokenCount || 0, tout: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) };
}

const details = (data, type) => (data?.error?.details || []).find(d => String(d['@type'] || '').includes(type));
export function classify(r) {
  if (r.ok) return 'ok';
  const msg = r.data?.error?.message || '';
  if (r.status === 429) {
    const q = details(r.data, 'QuotaFailure');
    const ids = (q?.violations || []).map(v => `${v.quotaId || ''} ${v.quotaMetric || ''}`).join(' ');
    if (/PerDay|per_day|requests_per_day/i.test(ids) || /per day|daily/i.test(msg)) return 'quota_day';
    return 'quota_min';
  }
  if (r.status === 503 || r.status === 500 || r.status === 504 || /high demand|overloaded|unavailable|try again later/i.test(msg)) return 'busy';
  if ([400, 403, 404].includes(r.status) && /model|no longer|not found|not supported|is not available/i.test(msg) && !/media|thinking|fps|video_?metadata/i.test(msg)) return 'model_gone';
  if (r.status === 400 && /thinking|media_?resolution|video_?metadata|fps|Unknown name|Invalid value|not supported/i.test(msg)) return 'bad_config';
  return 'error';
}
const retryMs = data => { const d = details(data, 'RetryInfo'); const s = parseFloat(d?.retryDelay); return Number.isFinite(s) ? s * 1000 : null; };

export async function usableModels() {
  const rows = await todayUsage();
  const gone = new Set(rows.filter(r => r.day_exhausted).map(r => r.model));
  const now = Date.now();
  const list = MODELS.filter(m => !gone.has(m) && !((cool.get(m) || 0) > now));
  return { list, exhausted: MODELS.filter(m => gone.has(m)) };
}

/**
 * cfgs: [{gen: generationConfig, meta: bool}] — 같은 모델에서 순서대로 시도할 설정.
 *   설정 오류(400)거나 validate가 false면 다음 설정으로 다시.
 * buildParts(cfg) → parts
 * 반환: {ok:true, model, text, cfgIndex} | {ok:false, reason:'quota_day'|'quota'|'busy'|'too_long'|'error', message, resetAt}
 */
export async function generate({ key, cfgs, buildParts, validate = () => true, emit = () => {}, left = () => 1e9 }) {
  const { list, exhausted } = await usableModels();
  const models = list.length ? list : MODELS.filter(m => !exhausted.includes(m));
  let saw = { busy: 0, quota: 0, day: exhausted.length, err: null }, best = null;
  for (const model of models) {
    let ci = 0, busyTries = 0, minTries = 0;
    while (ci < cfgs.length) {
      if (left() < 8000) return { ok: false, reason: 'too_long' };
      const cfg = cfgs[ci];
      const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), left());
      let r;
      try { r = await callOnce(key, model, buildParts(cfg), cfg.gen, ctrl.signal); }
      catch (e) { if (e.name === 'AbortError') return { ok: false, reason: 'too_long' }; r = { status: 0, ok: false, data: { error: { message: e.message } } }; }
      finally { clearTimeout(tm); }
      const kind = classify(r);
      const msg = r.data?.error?.message || '';
      bumpUsage(model, { ok: kind === 'ok' ? 1 : 0, busy: kind === 'busy' ? 1 : 0, limited: kind.startsWith('quota') ? 1 : 0, tin: r.tin || 0, tout: r.tout || 0, exhausted: kind === 'quota_day', err: kind === 'ok' ? null : `${r.status} ${msg}` });

      if (kind === 'ok') {
        const meta = { finish: r.finish, block: r.data?.promptFeedback?.blockReason || '' };
        if (validate(r.text)) return { ok: true, model, text: r.text, cfgIndex: ci, ...meta };
        best = best || { ok: true, model, text: r.text, cfgIndex: ci, weak: true, ...meta };
        if (ci + 1 < cfgs.length && left() > 60000) { emit({ stage: 'retry' }); ci++; continue; }
        return best;
      }
      if (kind === 'bad_config') { ci++; continue; }
      if (kind === 'busy') {
        saw.busy++;
        if (busyTries++ === 0 && left() > 90000) { emit({ stage: 'busy', model }); await sleep(1500); continue; }
        cool.set(model, Date.now() + 90_000); emit({ stage: 'switch', model, why: 'busy' }); break;
      }
      if (kind === 'quota_min') {
        saw.quota++;
        const wait = retryMs(r.data) ?? 20000;
        if (minTries++ === 0 && wait <= 15000 && left() > wait + 60000) { emit({ stage: 'wait', model, sec: Math.ceil(wait / 1000) }); await sleep(wait + 500); continue; }
        cool.set(model, Date.now() + Math.max(wait, 30000)); emit({ stage: 'switch', model, why: 'quota' }); break;
      }
      if (kind === 'quota_day') { saw.day++; cool.set(model, nextReset().getTime()); emit({ stage: 'switch', model, why: 'day' }); break; }
      // model_gone 또는 기타 오류 → 다음 모델
      saw.err = { status: r.status, message: msg.slice(0, 300) };
      console.error('Gemini', model, r.status, msg.slice(0, 200));
      break;
    }
  }
  if (best) return best;
  // 시도한 모델이 모두 '오늘 한도 소진'이면 하루 한도 안내 (붐벼서 잠시 건너뛴 모델은 제외)
  if (saw.day && !saw.quota && !saw.busy && !saw.err) return { ok: false, reason: 'quota_day', resetAt: nextReset().toISOString() };
  if (saw.quota || saw.day) return { ok: false, reason: 'quota', resetAt: nextReset().toISOString() };
  if (saw.busy) return { ok: false, reason: 'busy' };
  return { ok: false, reason: 'error', ...(saw.err || {}) };
}
