// 앱이 보낸 로그인 토큰이 진짜인지 Supabase에 확인 → 사용자 정보
export async function verifyUser(req) {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const pub = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!url || !pub || !token) return null;
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: pub, Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch { return null; }
}
