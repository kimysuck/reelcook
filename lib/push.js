// 분석 완료 알림 (웹 푸시). 라이브러리 없이 표준(RFC 8291 암호화 + RFC 8292 VAPID)대로 직접 보낸다.
// 서버 열쇠(VAPID)는 SUPABASE_SECRET_KEY에서 만들어서 Vercel에 따로 설정할 것이 없다.
import crypto from 'node:crypto';
const b64u = b => Buffer.from(b).toString('base64url');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

let KEYS = null;
function vapid() {
  if (KEYS) return KEYS;
  const base = (process.env.SUPABASE_SECRET_KEY || '') + ':reelcook-vapid';
  for (let i = 0; i < 10; i++) {   // 거의 항상 첫 번째 값이 올바른 열쇠
    const d = crypto.createHash('sha256').update(base + i).digest();
    try {
      const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(d);
      const pub = ecdh.getPublicKey();
      const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: b64u(d), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: 'jwk' });
      return (KEYS = { pub, key });
    } catch {}
  }
  throw new Error('vapid');
}
export const pushReady = () => !!process.env.SUPABASE_SECRET_KEY;
export const vapidPublic = () => (pushReady() ? b64u(vapid().pub) : null);

// 알림 받을 주소는 브라우저 푸시 서비스만 허용 (엉뚱한 곳으로 요청이 가지 않게)
const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|web\.push\.apple\.com)\//;
export function cleanSub(s) {
  if (!s || typeof s !== 'object' || !PUSH_HOST.test(String(s.endpoint || '')) || String(s.endpoint).length > 800) return null;
  const k = s.keys || {};
  if (!/^[A-Za-z0-9_-]{80,100}={0,2}$/.test(k.p256dh || '') || !/^[A-Za-z0-9_-]{16,30}={0,2}$/.test(k.auth || '')) return null;
  return { endpoint: s.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } };
}

// RFC 8291 aes128gcm 암호화
export function encrypt(sub, text) {
  const ua = Buffer.from(sub.keys.p256dh, 'base64url'), auth = Buffer.from(sub.keys.auth, 'base64url');
  const as = crypto.createECDH('prime256v1'); as.generateKeys(); const asPub = as.getPublicKey();
  const shared = as.computeSecret(ua), salt = crypto.randomBytes(16);
  const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(text), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head.writeUInt8(65, 20);
  return Buffer.concat([head, asPub, body]);
}

function jwt(aud) {
  const enc = o => b64u(JSON.stringify(o));
  const data = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:reelcook.help@gmail.com' })}`;
  return `${data}.${b64u(crypto.sign('sha256', Buffer.from(data), { key: vapid().key, dsaEncoding: 'ieee-p1363' }))}`;
}

// msg: {title, body, url, tag}. 반환: HTTP 상태(404·410이면 그 폰은 알림을 끊음)
export async function sendPush(sub, msg) {
  const s = cleanSub(sub); if (!s || !pushReady()) return 0;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(s.endpoint, { method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `vapid t=${jwt(new URL(s.endpoint).origin)}, k=${vapidPublic()}`, TTL: '86400', Urgency: 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream' },
      body: encrypt(s, JSON.stringify(msg).slice(0, 3000)) });
    return r.status;
  } catch { return 0; } finally { clearTimeout(t); }
}
