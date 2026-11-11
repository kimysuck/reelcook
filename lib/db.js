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
