// 서버가 검토를 마친 사진만 Supabase Storage(photos 버킷)에 올린다
const URL_ = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = () => process.env.SUPABASE_SECRET_KEY || '';

export async function uploadPhoto(path, b64, mime = 'image/jpeg') {
  const r = await fetch(`${URL_()}/storage/v1/object/photos/${path}`, {
    method: 'POST',
    headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}`, 'Content-Type': mime, 'x-upsert': 'true' },
    body: Buffer.from(b64, 'base64'),
  });
  if (!r.ok) throw new Error('upload ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return path;
}
export const publicUrl = path => `${URL_()}/storage/v1/object/public/photos/${path}`;

export async function removePhoto(path) {
  try {
    await fetch(`${URL_()}/storage/v1/object/photos`, {
      method: 'DELETE', headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [path] }),
    });
  } catch {}
}
