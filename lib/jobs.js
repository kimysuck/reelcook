// 분석 작업(서버가 혼자 끝까지 하는 분석) 저장소 — Supabase analysis_jobs 표, 서버 비밀 키로만 접근
// 흐름: 앱이 작업을 맡김 → 서버가 단계(step)를 실행 → 시간이 모자라면 상태를 저장하고 스스로 다음 단계를 호출
//       → 끝나면 결과 저장 → 앱이 열려 있으면 바로, 꺼져 있었으면 다음에 열 때 결과를 받아 감(받으면 삭제)
import crypto from 'node:crypto';
import { waitUntil } from '@vercel/functions';

// Vercel이 "응답한 뒤에도 끝까지 일하기"(waitUntil)를 지원하는지. 지원하면 다음 단계 요청에 바로 답하고 분석은 계속한다.
// (예전: 다음 단계를 부른 쪽이 2.5초 뒤 연결을 끊으면 분석까지 멈춰서, 앱을 다시 열어야 이어졌다)
export const canBg = () => !!globalThis[Symbol.for('@vercel/request-context')]?.get?.()?.waitUntil;
export function background(promise) { waitUntil(promise); }
const URL_ = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = () => process.env.SUPABASE_SECRET_KEY || '';
const H = (extra = {}) => ({ apikey: KEY(), ...(KEY().startsWith('eyJ') ? { Authorization: `Bearer ${KEY()}` } : {}), 'Content-Type': 'application/json', ...extra });
export const jobsReady = () => !!(URL_() && KEY());
export const PAR = 2;                 // 한 기기에서 동시에 돌리는 작업 수 (무료 AI 한도 보호)
export const STALE_MS = 320_000;      // 이 시간 동안 소식이 없는 running 작업은 멈춘 것으로 보고 다시 시작
const T = '/rest/v1/analysis_jobs';
const HEART = '00000000-0000-4000-8000-000000000001';

async function call(path, init = {}, ms = 5000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(`${URL_()}${path}`, { ...init, headers: H(init.headers), signal: ctrl.signal }); return r.ok ? await r.json().catch(() => null) : null; }
  catch { return null; } finally { clearTimeout(t); }
}
// 기기 번호(앱이 만든 무작위 값)는 해시로만 저장한다
export const ownerOf = dev => /^[0-9a-f]{32}$/.test(String(dev || '')) ? 'd:' + crypto.createHash('sha256').update(String(dev)).digest('hex').slice(0, 32) : null;
// 서버끼리 부를 때 쓰는 비밀값: 서버 비밀 키에서 만들어 따로 설정할 필요가 없다
export const jobKey = () => crypto.createHash('sha256').update(KEY() + ':reelcook-jobs').digest('hex');

export async function createJob(row) { const r = await call(T, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }); return Array.isArray(r) ? r[0] : null; }
export async function getJob(id) { const r = await call(`${T}?id=eq.${encodeURIComponent(id)}&select=*`); return Array.isArray(r) ? r[0] || null : null; }
export async function listJobs(owner, ids) {
  const f = ids && ids.length ? `&id=in.(${ids.map(encodeURIComponent).join(',')})` : '';
  const r = await call(`${T}?owner=eq.${encodeURIComponent(owner)}${f}&select=id,link,status,stage,hop,created_at,updated_at,result&order=created_at.asc&limit=40`);
  return Array.isArray(r) ? r : [];
}
export async function patchJob(id, patch, extraFilter = '') {
  const r = await call(`${T}?id=eq.${encodeURIComponent(id)}${extraFilter}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
  return Array.isArray(r) ? r : [];
}
export async function deleteJobs(owner, ids) {
  if (!ids.length) return;
  await call(`${T}?owner=eq.${encodeURIComponent(owner)}&id=in.(${ids.map(encodeURIComponent).join(',')})`, { method: 'DELETE' });
}
export async function countActive(owner) {
  const stale = new Date(Date.now() - STALE_MS).toISOString();
  const r = await call(`${T}?owner=eq.${encodeURIComponent(owner)}&status=eq.running&updated_at=gt.${stale}&select=id`);
  return Array.isArray(r) ? r.length : 0;
}
export async function countOpen(owner, prio = null) {
  const r = await call(`${T}?owner=eq.${encodeURIComponent(owner)}&status=in.(queued,running)${prio == null ? '' : `&prio=eq.${prio}`}&select=id`);
  return Array.isArray(r) ? r.length : 0;
}
export async function nextQueued(owner) {
  const stale = new Date(Date.now() - STALE_MS).toISOString();   // 멈춘 running 작업도 다시 맡긴다
  const r = await call(`${T}?owner=eq.${encodeURIComponent(owner)}&or=(status.eq.queued,and(status.eq.running,updated_at.lt.%22${stale}%22))&select=id&order=prio.asc,created_at.asc&limit=${PAR}`);
  return Array.isArray(r) ? r.map(x => x.id) : [];
}
// 차례가 온 작업을 "내가 맡음"으로 바꾼다. 다른 서버가 먼저 맡았으면 빈 배열 → 건너뜀
export async function claimJob(id) {
  const stale = new Date(Date.now() - STALE_MS).toISOString();
  return (await patchJob(id, { status: 'running' }, `&or=(status.eq.queued,and(status.eq.running,updated_at.lt.%22${stale}%22))`))[0] || null;
}

// 서버가 스스로 다음 단계를 부른다. 상대 서버가 요청을 받기만 하면 되므로 잠깐 기다리고 끊는다(상대는 계속 실행).
// 주소는 요청 헤더가 아니라 정해 둔 우리 도메인만 쓴다(비밀값이 다른 곳으로 새지 않게). Vercel 설정은 필요 없다.
// (배포마다 붙는 주소 VERCEL_URL은 Vercel 보호 기능 때문에 막힐 수 있어 쓰지 않는다)
export function jobBase() {
  if (process.env.JOB_BASE_URL) return process.env.JOB_BASE_URL.replace(/\/$/, '');
  const h = process.env.VERCEL_PROJECT_PRODUCTION_URL || 'reelcook.vercel.app';
  return 'https://' + h.replace(/^https?:\/\//, '').replace(/\/$/, '');
}
const selfHeaders = () => ({ 'x-job-key': jobKey(), ...(process.env.APP_PASSCODE ? { 'x-app-passcode': process.env.APP_PASSCODE } : {}) });
export async function kick(id) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);   // 상대는 받자마자 답한다(waitUntil)
  try { await fetch(`${jobBase()}/api/jobs?step=${encodeURIComponent(id)}`, { method: 'POST', headers: selfHeaders(), signal: ctrl.signal }); }
  catch {} finally { clearTimeout(t); }
  return true;
}
// 점검: 작업 표를 읽을 수 있는지, 서버가 자기 자신을 부를 수 있는지 (설정 > AI 사용량에 보여 줌)
export async function diagnose() {
  const out = { base: jobBase().replace(/^https:\/\//, ''), table: false, self: null, bg: canBg() };
  out.table = Array.isArray(await call(`${T}?select=id&limit=1`));
  const h = await getJob(HEART); out.sweepAgo = h ? Math.round((Date.now() - Date.parse(h.updated_at)) / 1000) : null;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try { const r = await fetch(`${jobBase()}/api/jobs?ping=1`, { method: 'POST', headers: selfHeaders(), signal: ctrl.signal }); out.self = r.status === 200 ? 'ok' : 'http_' + r.status; }
  catch (e) { out.self = e.name === 'AbortError' ? 'timeout' : 'error'; } finally { clearTimeout(t); }
  return out;
}
// 이 기기의 빈자리만큼 기다리는 작업을 시작시킨다
export async function kickNext(owner) {
  const free = PAR - await countActive(owner); if (free <= 0) return;
  for (const id of (await nextQueued(owner)).slice(0, free)) await kick(id);
}
// 안전망(1분마다 Supabase가 부름): 멈춘 작업이 있는 기기마다 다시 시작시킨다
export async function sweep() {
  const now = Date.now(), q = new Date(now - 20_000).toISOString(), stale = new Date(now - STALE_MS).toISOString();
  const r = await call(`${T}?or=(and(status.eq.queued,updated_at.lt.%22${q}%22),and(status.eq.running,updated_at.lt.%22${stale}%22))&select=owner&limit=50`);
  const owners = [...new Set((Array.isArray(r) ? r : []).map(x => x.owner))].slice(0, 10);
  for (const o of owners) await kickNext(o);
  // 안전망이 돌고 있다는 표시(점검 화면에 "n초 전 확인"으로 보여 줌). 이용자 작업이 아니라 목록에는 안 나온다
  if (!(await patchJob(HEART, { stage: 'sweep' })).length) await createJob({ id: HEART, owner: 'sys', status: 'done', stage: 'sweep', link: null });
  return owners.length;
}
export async function cleanupJobs() {
  if (!jobsReady()) return;
  await call(`${T}?created_at=lt.${new Date(Date.now() - 3 * 86400e3).toISOString()}`, { method: 'DELETE' });
}
