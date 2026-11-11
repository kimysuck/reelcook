// 인스타그램 릴스 링크 → 캡션 텍스트 + 영상 파일 가져오기
// 공개 게시물의 "임베드(퍼가기)" 페이지를 읽는 방식입니다.
// ⚠️ 비공식 방식이라 인스타그램이 페이지 구조를 바꾸거나 서버 IP를 막으면 실패할 수 있습니다.
//    실패하면 앱이 사용자에게 캡션/영상을 직접 넣어 달라고 안내합니다.

const UA = 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const MAX_VIDEO_BYTES = 40 * 1024 * 1024; // 40MB 넘는 영상은 건너뜀

export function shortcodeOf(link) {
  const m = String(link || '').match(/instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,})/i);
  return m ? m[1] : null;
}

function decodeEntities(s) {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .trim();
}
function unescapeJsonString(s) {
  try { return JSON.parse('"' + s + '"'); } catch { return s.replace(/\\u0026/g, '&').replace(/\\\//g, '/'); }
}

async function getText(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error('http ' + r.status);
  return await r.text();
}

function findVideoUrl(html) {
  // 임베드 페이지 안의 JSON에서 video_url 찾기 (이스케이프가 한 번 또는 두 번 된 경우 모두)
  const pats = [/"video_url"\s*:\s*"([^"]+)"/, /\\"video_url\\"\s*:\s*\\"(.*?)\\"/];
  for (const p of pats) {
    const m = html.match(p);
    if (m) {
      let u = unescapeJsonString(m[1]);
      if (u.includes('\\')) u = unescapeJsonString(u);
      if (/^https:\/\//.test(u)) return u;
    }
  }
  const og = html.match(/<meta[^>]+property="og:video(?::secure_url)?"[^>]+content="([^"]+)"/i);
  return og ? decodeEntities(og[1]) : null;
}

function findCaption(html) {
  const m = html.match(/<div class="Caption"[^>]*>([\s\S]*?)<div class="CaptionComments"/i)
        || html.match(/<div class="Caption"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (m) {
    let t = decodeEntities(m[1]);
    t = t.replace(/^\S+\s*\n?/, ''); // 맨 앞 작성자 아이디 제거
    if (t.length > 3) return t;
  }
  const j = html.match(/"edge_media_to_caption"\s*:\s*\{\s*"edges"\s*:\s*\[\s*\{\s*"node"\s*:\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/)
        || html.match(/\\"text\\":\\"((?:[^"\\]|\\\\.)*?)\\"/);
  if (j) return unescapeJsonString(j[1]).trim();
  const og = html.match(/<meta[^>]+(?:property|name)="(?:og:)?description"[^>]+content="([^"]+)"/i);
  if (og) {
    const d = decodeEntities(og[1]);
    const q = d.match(/:\s*["“](.*)["”]\s*\.?$/s); // "좋아요 n개 - user, 날짜: "캡션""
    return (q ? q[1] : d).trim();
  }
  return '';
}

const CDN_OK = /^https:\/\/([a-z0-9-]+\.)*(cdninstagram\.com|fbcdn\.net)\//i;

// 영상 내려받기 (인스타 CDN 주소만 허용)
export async function downloadVideo(vurl, notes = []) {
  if (!CDN_OK.test(String(vurl || ''))) { notes.push('video_bad_host'); return null; }
  try {
    const vr = await fetch(vurl, { headers: { 'User-Agent': UA, 'Referer': 'https://www.instagram.com/' } });
    const len = +(vr.headers.get('content-length') || 0);
    if (!vr.ok) { notes.push('video_http_' + vr.status); return null; }
    if (len > MAX_VIDEO_BYTES) { notes.push('video_too_big'); return null; }
    const buf = Buffer.from(await vr.arrayBuffer());
    if (buf.length > MAX_VIDEO_BYTES) { notes.push('video_too_big'); return null; }
    let mime = (vr.headers.get('content-type') || 'video/mp4').split(';')[0];
    if (!mime.startsWith('video/')) mime = 'video/mp4';
    return { b64: buf.toString('base64'), mime, bytes: buf.length };
  } catch (e) { notes.push('video_' + e.message); return null; }
}

const str = v => (typeof v === 'string' ? v : (v && typeof v.text === 'string' ? v.text : '')).trim();
const RECIPE_HINT = /재료|양념|숟|스푼|큰술|작은술|컵|\d\s?(g|ml|개|T|t)\b|레시피|recipe/i;

// 작성자가 댓글에 레시피를 적어 두는 경우가 많아서 같이 읽는다
function pickComments(it) {
  const owner = String(it.owner_username || it.author_handle || it.ownerUsername || '').toLowerCase();
  const list = Array.isArray(it.comments) ? it.comments : [];
  const norm = list.map(c => ({
    text: str(c?.text ?? c?.body ?? c),
    user: String(c?.owner_username || c?.username || c?.author || c?.owner?.username || c?.ownerUsername || '').toLowerCase(),
  })).filter(c => c.text);
  const mine = owner ? norm.filter(c => c.user === owner) : [];
  const recipeLike = norm.filter(c => RECIPE_HINT.test(c.text) && c.text.length > 20);
  const chosen = [...mine, ...recipeLike.filter(c => !mine.includes(c))].slice(0, 4);
  return chosen.map(c => c.text.slice(0, 1500));
}

// ① Apify 대행 서비스 (Vercel 서버 IP가 인스타에 막혀도 동작)
async function viaApify(link, out) {
  const token = process.env.APIFY_TOKEN;
  if (!token) return false;
  const actor = (process.env.APIFY_ACTOR || 's-r/instagram-post-scraper').replace('/', '~');
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 90000);
  try {
    const r = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=80`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ search: [link], includeComments: true, maxComments: 15, includeCreatorStats: false }),
    });
    if (!r.ok) { out.notes.push('apify_http_' + r.status); return false; }
    const items = await r.json();
    const it = Array.isArray(items) ? items.find(x => x && !x.unavailable) : null;
    if (!it) { out.notes.push('apify_empty'); return false; }
    out.caption = str(it.caption) || str(it.text) || str(it.description) || str(it.edge_media_to_caption?.edges?.[0]?.node) || '';
    out.comments = pickComments(it);
    out.videoUrl = it.video_url || it.videoUrl || null;
    out.thumbUrl = it.thumbnail_url || it.image_url || null;
    out.duration = it.duration_seconds || null;
    out.via = 'apify';
    if (!out.videoUrl) out.notes.push('apify_no_video');
    return !!(out.caption || out.videoUrl);
  } catch (e) { out.notes.push('apify_' + (e.name === 'AbortError' ? 'timeout' : e.message)); return false; }
  finally { clearTimeout(t); }
}

// ② 직접 가져오기 (공개 임베드 페이지). 데이터센터 IP는 막히는 경우가 많음.
async function direct(out) {
  let html = '';
  try { html = await getText(`https://www.instagram.com/p/${out.code}/embed/captioned/`); }
  catch (e) { out.notes.push('embed_' + e.message); }
  if (html) {
    out.caption = findCaption(html);
    out.videoUrl = findVideoUrl(html);
    if (!out.caption && !out.videoUrl) out.notes.push('embed_len_' + html.length + (/login|로그인/i.test(html) ? '_loginwall' : ''));
  }
  if (out.caption || out.videoUrl) out.via = 'direct';
}

// 릴스 정보(캡션·작성자 댓글·영상 주소)만 가져오기 — 영상 파일은 받지 않음
export async function getReelMeta(link) {
  const code = shortcodeOf(link);
  const out = { code, caption: '', comments: [], videoUrl: null, thumbUrl: null, duration: null, via: null, notes: [] };
  if (!code) { out.notes.push('not_instagram'); return out; }
  const ok = await viaApify(`https://www.instagram.com/reel/${code}/`, out);
  if (!ok) await direct(out);
  if (!out.caption) out.notes.push('no_caption');
  return out;
}

// 진단용: 정보 + 영상 파일까지
export async function fetchInstagram(link) {
  const meta = await getReelMeta(link);
  const v = meta.videoUrl ? await downloadVideo(meta.videoUrl, meta.notes) : null;
  return { ...meta, videoB64: v?.b64 || null, videoMime: v?.mime || null, videoBytes: v?.bytes || 0 };
}
