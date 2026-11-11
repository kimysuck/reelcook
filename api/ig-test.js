// 진단용: 서버가 인스타에서 무엇을 가져오는지 확인
// 사용법: /api/ig-test?url=<릴스링크>&pass=<APP_PASSCODE>
import { fetchInstagram } from '../lib/instagram.js';

export default async function handler(req, res) {
  const pass = process.env.APP_PASSCODE;
  if (pass && req.query.pass !== pass) return res.status(401).json({ error: 'passcode' });
  const r = await fetchInstagram(String(req.query.url || ''));
  res.status(200).json({
    code: r.code,
    via: r.via,
    apifyConfigured: !!process.env.APIFY_TOKEN,
    captionFound: !!r.caption,
    captionPreview: r.caption.slice(0, 300),
    videoFound: !!r.videoB64,
    videoMB: +(r.videoBytes / 1048576).toFixed(2),
    notes: r.notes,
  });
}
