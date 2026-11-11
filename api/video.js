// 릴스 영상 중계: 단계별 장면을 보여주기 위해 인스타 CDN 영상을 같은 주소(우리 도메인)로 전달
// <video>가 보내는 범위(Range) 요청을 3MB 조각으로 나눠 스트리밍 → Vercel 응답 크기 제한 회피
import { CDN_OK } from '../lib/instagram.js';

export const config = { maxDuration: 60 };
const CHUNK = 3 * 1024 * 1024;
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

export default async function handler(req, res) {
  const pass = process.env.APP_PASSCODE;
  if (pass && req.query.k !== pass) return res.status(401).end();
  const u = String(req.query.u || '');
  if (!CDN_OK.test(u)) return res.status(400).end();

  const m = String(req.headers.range || 'bytes=0-').match(/bytes=(\d*)-(\d*)/);
  const start = m && m[1] ? +m[1] : 0;
  const want = m && m[2] ? +m[2] : start + CHUNK - 1;
  const end = Math.min(want, start + CHUNK - 1);

  let up;
  try { up = await fetch(u, { headers: { Range: `bytes=${start}-${end}`, 'User-Agent': UA, Referer: 'https://www.instagram.com/' } }); }
  catch { return res.status(502).end(); }
  if (up.status === 403 || up.status === 404 || up.status === 410) return res.status(410).end(); // 링크 만료
  if (!up.ok) return res.status(502).end();

  res.statusCode = up.status === 206 ? 206 : 200;
  res.setHeader('Content-Type', (up.headers.get('content-type') || 'video/mp4').split(';')[0]);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  const cr = up.headers.get('content-range'); if (cr) res.setHeader('Content-Range', cr);
  const cl = up.headers.get('content-length'); if (cl) res.setHeader('Content-Length', cl);
  try { for await (const chunk of up.body) res.write(chunk); } catch {}
  res.end();
}
