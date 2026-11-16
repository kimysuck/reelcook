// 하루 분석 횟수 제한 + 실패 기록 (Supabase, 서버 비밀 키로만 접근)
// - 기준 시각: 한국 시간 자정
// - 로그인 사용자는 계정 ID, 로그인 안 한 사람은 IP를 소금 친 해시로만 기록(원래 IP는 저장 안 함)
// - 테스터(Vercel 환경변수 TESTER_EMAILS에 적은 이메일)는 제한 없음
import crypto from 'node:crypto';
const URL_ = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = () => process.env.SUPABASE_SECRET_KEY || '';
const H = () => ({ apikey: KEY(), ...(KEY().startsWith('eyJ') ? { Authorization: `Bearer ${KEY()}` } : {}), 'Content-Type': 'application/json' });
const ready = () => !!(URL_() && KEY());

export const DAILY_LIMIT = Math.max(1, +process.env.DAILY_LIMIT || 10);
export const kstDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
export function kstMidnight(now = new Date()) {
  const [y, m, d] = kstDay(now).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1) - 9 * 3600e3);   // 다음날 0시(KST)
}
export function isTester(user) {
  const list = String(process.env.TESTER_EMAILS || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
  return !!(user && user.email && list.includes(String(user.email).toLowerCase()));
}
export function whoOf(req, user) {
  if (user && user.id) return 'u:' + user.id;
  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim() || 'unknown';
  return 'ip:' + crypto.createHash('sha256').update(ip + '|' + KEY().slice(-16)).digest('hex').slice(0, 24);
}
async function call(path, init = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 3000);
  try { const r = await fetch(`${URL_()}${path}`, { ...init, headers: H(), signal: ctrl.signal }); return r.ok ? await r.json().catch(() => null) : null; }
  catch { return null; } finally { clearTimeout(t); }
}
// 오늘 쓴 횟수 (기록을 못 읽으면 0으로 보고 분석은 막지 않는다)
export async function usedToday(who) {
  if (!ready()) return 0;
  const rows = await call(`/rest/v1/analysis_quota?day=eq.${kstDay()}&who=eq.${encodeURIComponent(who)}&select=n`);
  return Array.isArray(rows) && rows[0] ? rows[0].n : 0;
}
export async function addUse(who) {
  if (!ready()) return null;
  const n = await call('/rest/v1/rpc/bump_analysis_quota', { method: 'POST', body: JSON.stringify({ p_day: kstDay(), p_who: who }) });
  return typeof n === 'number' ? n : null;
}
// 실패 기록: 누가 했는지는 남기지 않는다(릴스 코드·원인·모델만)
export async function logFailure({ code = null, error = '', notes = [], mode = null, model = null, sec = 0 }) {
  if (!ready()) return;
  await call('/rest/v1/analysis_failures', { method: 'POST', body: JSON.stringify({ reel_code: code, error: String(error).slice(0, 60), notes: (notes || []).slice(0, 12).map(x => String(x).slice(0, 80)), mode, model, sec: Math.round(sec) }) });
}
export async function recentFailures(limit = 10) {
  if (!ready()) return [];
  const rows = await call(`/rest/v1/analysis_failures?select=at,reel_code,error,notes,mode,model,sec&order=at.desc&limit=${limit}`);
  return Array.isArray(rows) ? rows : [];
}

// 보관 기간 지키기: 가끔(약 5%) 오래된 기록을 지운다 — 횟수 3일, 실패·사용량 30일
export async function cleanupMaybe() {
  if (!ready() || Math.random() > 0.05) return;
  const d = n => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);
  await Promise.all([
    call(`/rest/v1/analysis_quota?day=lt.${d(3)}`, { method: 'DELETE' }),
    call(`/rest/v1/analysis_failures?at=lt.${d(30)}`, { method: 'DELETE' }),
    call(`/rest/v1/ai_usage?day=lt.${d(30)}`, { method: 'DELETE' }),
  ]);
  const { cleanupStats } = await import('./stats.js'); await cleanupStats();   // 운영 통계 30일 · 사용 후기 1년
}
