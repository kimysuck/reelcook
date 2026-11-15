// 분석 작업(서버가 혼자 끝까지 하는 분석) 저장소 — Supabase analysis_jobs 표, 서버 비밀 키로만 접근
// 흐름: 앱이 작업을 맡김 → 서버가 단계(step)를 실행 → 시간이 모자라면 상태를 저장하고 스스로 다음 단계를 호출
//       → 끝나면 결과 저장 → 앱이 열려 있으면 바로, 꺼져 있었으면 다음에 열 때 결과를 받아 감(받으면 삭제)
import crypto from 'node:crypto';
const URL_ = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = () => process.env.SUPABASE_SECRET_KEY || '';
const H = (extra = {}) => ({ apikey: KEY(), ...(KEY().startsWith('eyJ') ? { Authorization: `Bearer ${KEY()}` } : {}), 'Content-Type': 'application/json', ...extra });
export const jobsReady = () => !!(URL_() && KEY());
export const PAR = 2;                 // 한 기기에서 동시에 돌리는 작업 수 (무료 AI 한도 보호)
export const STALE_MS = 320_000;      // 이 시간 동안 소식이 없는 running 작업은 멈춘 것으로 보고 다시 시작
const T = '/rest/v1/analysis_jobs';

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
export async function countOpen(owner) {
  const r = await call(`${T}?owner=eq.${encodeURIComponent(owner)}&status=in.(queued,running)&select=id`);
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
// 주소는 요청 헤더가 아니라 Vercel이 알려 주는 우리 도메인만 쓴다(비밀값이 다른 곳으로 새지 않게).
export function jobBase() {
  if (process.env.JOB_BASE_URL) return process.env.JOB_BASE_URL.replace(/\/$/, '');
  const h = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return h ? 'https://' + h : null;
}
export async function kick(id) {
  const base = jobBase(); if (!base) return false;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 2500);
  try { await fetch(`${base}/api/jobs?step=${encodeURIComponent(id)}`, { method: 'POST', headers: { 'x-job-key': jobKey(), ...(process.env.APP_PASSCODE ? { 'x-app-passcode': process.env.APP_PASSCODE } : {}) }, signal: ctrl.signal }); }
  catch {} finally { clearTimeout(t); }
  return true;
}
// 이 기기의 빈자리만큼 기다리는 작업을 시작시킨다
export async function kickNext(owner) {
  const free = PAR - await countActive(owner); if (free <= 0) return;
  for (const id of (await nextQueued(owner)).slice(0, free)) await kick(id);
}
export async function cleanupJobs() {
  if (!jobsReady()) return;
  await call(`${T}?created_at=lt.${new Date(Date.now() - 3 * 86400e3).toISOString()}`, { method: 'DELETE' });
}
