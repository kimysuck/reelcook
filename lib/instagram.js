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

export async function fetchInstagram(link, { wantVideo = true } = {}) {
  const code = shortcodeOf(link);
  const out = { code, caption: '', videoB64: null, videoMime: null, videoBytes: 0, notes: [] };
  if (!code) { out.notes.push('not_instagram'); return out; }

  let html = '';
  try { html = await getText(`https://www.instagram.com/p/${code}/embed/captioned/`); }
  catch (e) { out.notes.push('embed_' + e.message); }

  if (html) {
    out.caption = findCaption(html);
    const vurl = wantVideo ? findVideoUrl(html) : null;
    if (vurl) {
      try {
        const vr = await fetch(vurl, { headers: { 'User-Agent': UA, 'Referer': 'https://www.instagram.com/' } });
        const len = +vr.headers.get('content-length') || 0;
        if (!vr.ok) out.notes.push('video_http_' + vr.status);
        else if (len > MAX_VIDEO_BYTES) out.notes.push('video_too_big');
        else {
          const buf = Buffer.from(await vr.arrayBuffer());
          if (buf.length <= MAX_VIDEO_BYTES) {
            out.videoB64 = buf.toString('base64');
            out.videoMime = (vr.headers.get('content-type') || 'video/mp4').split(';')[0];
            out.videoBytes = buf.length;
          } else out.notes.push('video_too_big');
        }
      } catch (e) { out.notes.push('video_' + e.message); }
    } else if (wantVideo) out.notes.push('no_video_url');
  }

  // 캡션을 못 찾았으면 일반 게시물 페이지의 미리보기 문구로 한 번 더 시도
  if (!out.caption) {
    try { out.caption = findCaption(await getText(`https://www.instagram.com/reel/${code}/`)); }
    catch (e) { out.notes.push('page_' + e.message); }
  }
  if (!out.caption) out.notes.push('no_caption');
  return out;
}
