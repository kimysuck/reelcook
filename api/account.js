// 동의 기록 저장(action: consent) · 회원 탈퇴(action: delete)
// 탈퇴: 올린 사진 삭제 → auth 사용자 삭제(프로필·레시피·게시물·하트는 DB에서 연쇄 삭제)
import { verifyUser } from '../lib/auth.js';
import { dbUpdate } from '../lib/db.js';

export const config = { maxDuration: 30 };
const URL_ = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = () => process.env.SUPABASE_SECRET_KEY || '';
const H = (extra = {}) => ({ apikey: KEY(), ...(KEY().startsWith('eyJ') ? { Authorization: `Bearer ${KEY()}` } : {}), 'Content-Type': 'application/json', ...extra });

async function removeUserPhotos(uid) {
  const r = await fetch(`${URL_()}/storage/v1/object/list/photos`, {
    method: 'POST', headers: H(), body: JSON.stringify({ prefix: uid, limit: 1000, offset: 0 }),
  });
  if (!r.ok) throw new Error('사진 목록 ' + r.status);
  const names = (await r.json()).map(x => x && x.name).filter(Boolean).map(n => `${uid}/${n}`);
  if (!names.length) return 0;
  const d = await fetch(`${URL_()}/storage/v1/object/photos`, { method: 'DELETE', headers: H(), body: JSON.stringify({ prefixes: names }) });
  if (!d.ok) throw new Error('사진 삭제 ' + d.status);
  return names.length;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'login' });
  const b = req.body || {};
  try {
    if (b.action === 'consent') {
      const version = String(b.version || '').slice(0, 20);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) return res.status(400).json({ error: 'version' });
      const at = Date.parse(b.at); const when = Number.isFinite(at) && at <= Date.now() + 60000 ? new Date(at) : new Date();
      await dbUpdate('consents', { user_id: user.id }, { terms_version: version, agreed_at: when.toISOString() });
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'delete') {
      if (b.confirm !== '탈퇴') return res.status(400).json({ error: 'confirm' });
      const photos = await removeUserPhotos(user.id);
      const r = await fetch(`${URL_()}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE', headers: H() });
      if (!r.ok) throw new Error('계정 삭제 ' + r.status + ': ' + (await r.text()).slice(0, 160));
      return res.status(200).json({ ok: true, photos });
    }
    return res.status(400).json({ error: 'action' });
  } catch (e) {
    return res.status(500).json({ error: 'server', detail: String(e.message || e).slice(0, 200) });
  }
}
