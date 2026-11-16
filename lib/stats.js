// 운영 통계(analysis_stats)와 사용 후기(feedback) — 서버 비밀 키로만 접근. 누가 요청했는지는 남기지 않는다.
import { kstDay } from './quota.js';
const URL_ = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = () => process.env.SUPABASE_SECRET_KEY || '';
const H = (x = {}) => ({ apikey: KEY(), ...(KEY().startsWith('eyJ') ? { Authorization: `Bearer ${KEY()}` } : {}), 'Content-Type': 'application/json', ...x });
const ready = () => !!(URL_() && KEY());
async function call(path, init = {}, ms = 4000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(`${URL_()}${path}`, { ...init, headers: H(init.headers), signal: ctrl.signal }); return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) }; }
  catch { return { ok: false, status: 0, data: null }; } finally { clearTimeout(t); }
}
const since = days => kstDay(new Date(Date.now() - (days - 1) * 86400e3));

// kind: ok(새로 분석 성공) · cached(저장된 분석) · fail(실패) · tok(토큰만) · apify(릴스 정보 조회)
export async function bumpStats(kind, { n = 0, sec = 0, tin = 0, tout = 0 } = {}) {
  if (!ready()) return;
  await call('/rest/v1/rpc/bump_analysis_stats', { method: 'POST', body: JSON.stringify({ p_day: kstDay(), p_kind: kind, p_n: n, p_sec: Math.round(sec), p_in: Math.round(tin), p_out: Math.round(tout) }) }, 2500);
}
// 분석 하나(또는 이어서 분석의 한 단계)가 끝났을 때. final=false면 토큰만 더한다(이어서 분석 중간 단계)
export async function recordOutcome(out, meter, sec, final = true) {
  if (meter && (meter.tin || meter.tout)) await bumpStats('tok', { tin: meter.tin, tout: meter.tout });
  if (!final) return;
  const j = (out && out.json) || {};
  if (j.error === 'daily_limit' || j.error === 'passcode') return;
  const kind = out.status === 200 && !j.noRecipe ? (j.source && j.source.cached ? 'cached' : 'ok') : 'fail';
  await bumpStats(kind, { n: 1, sec: kind === 'cached' ? 0 : sec });
}
export async function statsSince(days) {
  if (!ready()) return [];
  const r = await call(`/rest/v1/analysis_stats?day=gte.${since(days)}&select=*`);
  return Array.isArray(r.data) ? r.data : [];
}
// 앱 시작 때 "보통 약 N분" 안내용 (최근 7일 새로 분석한 것의 평균). 10분 동안 기억
let avgCache = { at: 0, v: null };
export async function avgSec() {
  if (Date.now() - avgCache.at < 600_000) return avgCache.v;
  const rows = (await statsSince(7)).filter(r => r.kind === 'ok');
  const n = rows.reduce((a, r) => a + r.n, 0), s = rows.reduce((a, r) => a + Number(r.sec), 0);
  avgCache = { at: Date.now(), v: n >= 3 ? Math.round(s / n) : null };   // 3건 넘게 쌓였을 때만
  return avgCache.v;
}

// ── 사용 후기
export async function saveFeedback(owner, f) {
  if (!ready()) return { error: 'no_db' };
  const r = await call('/rest/v1/feedback', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ owner, sus: f.sus, cook_min: f.cook, comment: f.comment || null }) });
  if (r.status === 409) return { error: 'already' };
  return r.ok ? { ok: true } : { error: 'save_' + r.status };
}
// SUS 점수: 홀수 문항(점수-1) + 짝수 문항(5-점수) 합 × 2.5 → 0~100
export const susScore = a => a.reduce((s, v, i) => s + (i % 2 === 0 ? v - 1 : 5 - v), 0) * 2.5;
export async function feedbackSummary() {
  if (!ready()) return { n: 0 };
  const r = await call('/rest/v1/feedback?select=sus,cook_min,comment,at&order=at.desc&limit=500');
  const rows = Array.isArray(r.data) ? r.data : [];
  const cooks = rows.map(x => x.cook_min).filter(x => x != null);
  return { n: rows.length, sus: rows.length ? Math.round(rows.reduce((a, x) => a + susScore(x.sus), 0) / rows.length * 10) / 10 : null,
    cook: cooks.length ? Math.round(cooks.reduce((a, b) => a + b, 0) / cooks.length) : null,
    recent: rows.filter(x => x.comment).slice(0, 5).map(x => ({ at: x.at, text: x.comment })) };
}
export async function cleanupStats() {
  if (!ready()) return;
  await Promise.all([
    call(`/rest/v1/analysis_stats?day=lt.${kstDay(new Date(Date.now() - 30 * 86400e3))}`, { method: 'DELETE' }),
    call(`/rest/v1/feedback?at=lt.${new Date(Date.now() - 365 * 86400e3).toISOString()}`, { method: 'DELETE' }),   // 1년 보관
  ]);
}
