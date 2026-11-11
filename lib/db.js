// 서버 전용 Supabase 접근 (분석 결과 캐시). 비밀 키는 Vercel 환경변수 SUPABASE_SECRET_KEY에만 있음.
const URL_ = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = () => process.env.SUPABASE_SECRET_KEY || '';
export const dbReady = () => !!(URL_() && KEY());

function headers(extra = {}) {
  const k = KEY();
  // 새 형식(sb_secret_)은 apikey 헤더만, 예전 JWT 키는 Authorization도 함께
  return { apikey: k, ...(k.startsWith('eyJ') ? { Authorization: `Bearer ${k}` } : {}), 'Content-Type': 'application/json', ...extra };
}

export async function cacheGet(code) {
  if (!dbReady() || !code) return null;
  try {
    const r = await fetch(`${URL_()}/rest/v1/reel_cache?code=eq.${encodeURIComponent(code)}&select=*`, { headers: headers() });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0] || null;
  } catch { return null; }
}

export async function cachePut(code, row) {
  if (!dbReady() || !code) return;
  try {
    await fetch(`${URL_()}/rest/v1/reel_cache?on_conflict=code`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ code, ...row, updated_at: new Date().toISOString() }),
    });
  } catch {}
}

export async function cachePatch(code, patch) {
  if (!dbReady() || !code) return;
  try {
    await fetch(`${URL_()}/rest/v1/reel_cache?code=eq.${encodeURIComponent(code)}`, {
      method: 'PATCH', headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
  } catch {}
}

// 일반 테이블 쓰기 (서버 전용 — 검토를 거친 데이터만)
export async function dbInsert(table, row) {
  const r = await fetch(`${URL_()}/rest/v1/${table}`, {
    method: 'POST', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`DB(${table}) 저장 ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return (await r.json())[0];
}
export async function dbUpdate(table, match, patch) {
  const qs = Object.entries(match).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  const r = await fetch(`${URL_()}/rest/v1/${table}?${qs}`, {
    method: 'PATCH', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`DB(${table}) 수정 ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const rows = await r.json();
  if (!rows.length) return dbInsert(table, { ...match, ...patch }); // 행이 없으면 새로 만든다
  return rows[0];
}
export async function dbGet(table, match, select = '*') {
  const qs = Object.entries(match).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  const r = await fetch(`${URL_()}/rest/v1/${table}?${qs}&select=${select}`, { headers: headers() });
  if (!r.ok) return null;
  return (await r.json())[0] || null;
}
