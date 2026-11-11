// 피드 글 올리기: 서버가 사진·글을 검토 → 부적절한 사진은 모자이크 버전으로 저장, 부적절한 글은 거절
import { verifyUser } from '../lib/auth.js';
import { moderate } from '../lib/moderate.js';
import { uploadPhoto } from '../lib/storage.js';
import { dbInsert } from '../lib/db.js';

export const config = { maxDuration: 60 };
const B64_MAX = 1_600_000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'login' });
  const b = req.body || {};
  const kind = b.kind === 'recipe' ? 'recipe' : 'cook';
  const title = String(b.title || '').trim();
  const text = String(b.body || '').trim();
  const taste = Math.max(0, Math.min(5, Math.round(Number(b.taste) || 0)));
  const recipe = b.recipe && typeof b.recipe === 'object' ? b.recipe : null;
  const photo = typeof b.photo === 'string' && b.photo.length < B64_MAX ? b.photo : null;
  const mosaic = typeof b.mosaic === 'string' && b.mosaic.length < B64_MAX ? b.mosaic : null;

  if (title.length < 1 || title.length > 60) return res.status(400).json({ error: 'title_len' });
  if (text.length > 500) return res.status(400).json({ error: 'body_len' });
  if (kind === 'cook' && !photo) return res.status(400).json({ error: 'need_photo' });
  if (kind === 'recipe' && !recipe) return res.status(400).json({ error: 'need_recipe' });
  if (recipe && JSON.stringify(recipe).length > 200_000) return res.status(400).json({ error: 'recipe_too_big' });

  let verdict;
  try { verdict = await moderate({ imageB64: photo, text: `제목: ${title}\n${text}`, purpose: 'post' }); }
  catch (e) { return res.status(503).json({ error: e.message === 'busy' ? 'busy' : 'moderation_failed' }); }
  if (!verdict.textSafe) return res.status(400).json({ error: 'bad_text', reason: verdict.reason });

  try {
    let photo_path = null, flagged = false;
    if (photo) {
      if (verdict.imageSafe) photo_path = await uploadPhoto(`${user.id}/${Date.now()}.jpg`, photo);
      else {
        if (!mosaic) return res.status(400).json({ error: 'need_mosaic' });
        flagged = true;
        photo_path = await uploadPhoto(`${user.id}/${Date.now()}-m.jpg`, mosaic);
      }
    }
    const post = await dbInsert('posts', {
      user_id: user.id, kind, title, body: text || null, taste: kind === 'cook' ? taste : 0,
      photo_path, recipe, flagged, flag_reason: flagged ? `${verdict.category}: ${verdict.reason}`.slice(0, 200) : null,
    });
    return res.status(200).json({ post, flagged, reason: flagged ? verdict.reason : '' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'save_failed' });
  }
}
