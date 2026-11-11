// 프로필(닉네임·사진) 저장: 서버가 검토 → 부적절한 사진은 모자이크 버전만 저장
import { verifyUser } from '../lib/auth.js';
import { moderate } from '../lib/moderate.js';
import { uploadPhoto, publicUrl } from '../lib/storage.js';
import { dbUpdate } from '../lib/db.js';

export const config = { maxDuration: 60 };
const B64_MAX = 1_600_000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'login' });
  const b = req.body || {};
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 20) return res.status(400).json({ error: 'name_len' });

  let photo = typeof b.photo === 'string' && b.photo.length < B64_MAX ? b.photo : null;
  const mosaic = typeof b.mosaic === 'string' && b.mosaic.length < B64_MAX ? b.mosaic : null;

  // 구글 프로필 사진을 쓰는 경우: 서버가 받아서 같은 검토를 거친다
  let fromGoogle = false;
  if (!photo && b.useGoogle) {
    const g = user.user_metadata?.avatar_url || user.user_metadata?.picture || '';
    if (/^https:\/\/[a-z0-9.-]*googleusercontent\.com\//i.test(g)) {
      try { const r = await fetch(g); if (r.ok) { photo = Buffer.from(await r.arrayBuffer()).toString('base64'); fromGoogle = true; } } catch {}
    }
  }

  let verdict;
  try { verdict = await moderate({ imageB64: photo, text: `닉네임: ${name}`, purpose: 'avatar' }); }
  catch (e) { return res.status(503).json({ error: e.message === 'busy' ? 'busy' : 'moderation_failed' }); }
  if (!verdict.textSafe) return res.status(400).json({ error: 'bad_name', reason: verdict.reason });

  const patch = { name, setup_done: true };
  let flagged = false;
  try {
    if (photo) {
      if (verdict.imageSafe) {
        patch.avatar = publicUrl(await uploadPhoto(`${user.id}/avatar-${Date.now()}.jpg`, photo));
        patch.avatar_flagged = false;
      } else {
        flagged = true;
        patch.avatar_flagged = true;
        patch.avatar = mosaic && !fromGoogle ? publicUrl(await uploadPhoto(`${user.id}/avatar-${Date.now()}-m.jpg`, mosaic)) : null;
      }
    } else if (b.clearAvatar) { patch.avatar = null; patch.avatar_flagged = false; }
    const profile = await dbUpdate('profiles', { id: user.id }, patch);
    return res.status(200).json({ profile, flagged, reason: flagged ? verdict.reason : '' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'save_failed' });
  }
}
