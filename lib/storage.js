// 서버가 검토를 마친 사진만 Supabase Storage(photos 버킷)에 올린다
const URL_ = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = () => process.env.SUPABASE_SECRET_KEY || '';
// 새 형식(sb_secret_)은 apikey 헤더에만. 예전 JWT 키만 Authorization에도 넣는다
const auth = () => ({ apikey: KEY(), ...(KEY().startsWith('eyJ') ? { Authorization: `Bearer ${KEY()}` } : {}) });

export async function uploadPhoto(path, b64, mime = 'image/jpeg') {
  const r = await fetch(`${URL_()}/storage/v1/object/photos/${path}`, {
    method: 'POST',
    headers: { ...auth(), 'Content-Type': mime, 'x-upsert': 'true' },
    body: Buffer.from(b64, 'base64'),
  });
  if (!r.ok) throw new Error('사진 저장소 ' + r.status + ': ' + (await r.text()).slice(0, 160));
  return path;
}
export const publicUrl = path => `${URL_()}/storage/v1/object/public/photos/${path}`;

export async function removePhoto(path) {
  try {
    await fetch(`${URL_()}/storage/v1/object/photos`, {
      method: 'DELETE', headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [path] }),
    });
  } catch {}
}
