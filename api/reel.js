// 1단계: 릴스 링크 → 캡션 · 작성자 댓글 · 영상 주소 (분석 전에 먼저 보여주기 위해 분리)
import { getReelMeta } from '../lib/instagram.js';

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const pass = process.env.APP_PASSCODE;
  if (pass && req.headers['x-app-passcode'] !== pass) return res.status(401).json({ error: 'passcode' });
  const link = String(req.body?.link || '').slice(0, 500);
  const m = await getReelMeta(link).catch(e => ({ notes: ['error_' + e.message] }));
  res.status(200).json({
    caption: m.caption || '', comments: m.comments || [], videoUrl: m.videoUrl || null,
    thumbUrl: m.thumbUrl || null, duration: m.duration || null, via: m.via || null, notes: m.notes || [],
  });
}
