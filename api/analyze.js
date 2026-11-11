// 2단계: 캡션 · 작성자 댓글 · 영상 → Gemini → 레시피 JSON
// Gemini API 키는 Vercel 환경변수 GEMINI_API_KEY에만 있고, 폰(브라우저)에는 절대 전달되지 않습니다.

import { getReelMeta, downloadVideo, shortcodeOf, CDN_OK } from '../lib/instagram.js';
import { cacheGet, cachePut, cachePatch } from '../lib/db.js';

// Vercel 무료(Hobby) 플랜 최대 300초
export const config = { maxDuration: 300 };

// 모델은 자주 바뀌므로: 환경변수 GEMINI_MODEL이 있으면 그것을 먼저, 실패하면 다음 후보로 자동 전환
const MODELS = [...new Set([process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'].filter(Boolean))];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BUSY = /high demand|overloaded|unavailable|try again later|resource.?exhausted/i;
const RECIPE_HINT = /재료|양념|숟|스푼|큰술|작은술|컵|\d\s?(g|ml|개|T|t)\b|레시피|recipe/i;
const MAX_IMAGES = 8;
const MAX_IMAGE_B64 = 1_500_000;

function buildPrompt({ caption, comments, link, nImg, fromVideo, hasVideo }) {
  const sources = [
    caption ? '작성자 캡션' : null,
    comments.length ? '작성자/레시피 댓글' : null,
    hasVideo ? '릴스 영상 원본(화면 + 음성)' : null,
    nImg ? `${fromVideo ? '영상에서 순서대로 뽑은 장면' : '장면 스크린샷'} ${nImg}장` : null,
  ].filter(Boolean).join(', ');

  return `너는 요리 초보를 위한 레시피 정리 전문가다. 인스타그램 요리 릴스 자료(${sources})를 분석해 그대로 따라 할 수 있는 레시피를 JSON으로만 출력하라.

[자료 우선순위]
1) 캡션·댓글에 적힌 재료와 분량이 가장 정확하다. 반드시 먼저 반영한다.
2) 영상의 음성 설명과 화면 자막.
3) 영상 화면(재료 포장, 숟가락·컵에 담긴 양, 냄비 크기, 색 변화, 불 세기)으로 추정.
- 음성·자막·캡션이 전혀 없는 "요리 장면만 나오는 영상"이어도 반드시 레시피를 완성한다. 화면만 보고 재료·양·순서를 추정하고, ingredients와 steps를 절대 빈 배열로 두지 않는다. 확신이 낮으면 confidence를 "low"로, 추정 근거를 assumptions에 짧게 적는다.
- 자료가 요리가 아니면 title을 "레시피를 찾지 못했어요"로, ingredients와 steps는 빈 배열로 한다.

[분량 규칙 — 비율이 핵심]
- orig_qty/orig_unit: 영상·캡션에서 쓴 단위를 그대로 기록한다(숟갈, 큰술, 작은술, 컵, 종이컵, 꼬집, 줌, 개, 대, 쪽, 봉, g, ml 등). "2숟갈"→ orig_qty 2, orig_unit "숟갈". "반 개"→ 0.5, "개". "약간·적당히·톡톡"→ orig_qty null, orig_unit "약간".
- 분량이 안 나오면 영상 속 양을 보고 그 영상에서 쓰는 단위(주로 숟갈)로 추정해 orig_qty를 채우고 estimated: true.
- 같은 레시피 안에서 양념은 가능하면 같은 단위(예: 숟갈)로 통일해 비율을 비교할 수 있게 한다.
- grams/ml: 정밀 모드용 참고값. 한국 가정 기준으로 추정(밥숟가락 1 ≈ 10ml, 계량스푼 1큰술 = 15ml, 작은술 = 5ml, 종이컵 ≈ 180ml, 한 꼬집 ≈ 0.5g, 대파 1대 ≈ 100g, 양파 1개 ≈ 200g, 달걀 1개 ≈ 50g, 마늘 1쪽 ≈ 5g).
- primary: 정밀 모드에서 보여줄 단위("ml" 액체, "g" 고체·가루, "count" 달걀·통채소).

[단계]
- steps.text 안에서 재료를 언급할 때는 반드시 [[재료번호]] 토큰(0부터, ingredients 순서)을 쓴다. 예: "팬에 [[0]]을 올려 굽는다".
- heat: "약불","중불","강불","불 끔","없음" 중 하나. seconds: 그 단계 소요 시간(초).
- cue: 다음 단계로 넘어가도 되는 상태를 눈으로 확인할 수 있게 짧고 구체적으로. tip: 초보 팁 한 문장. mistake: 흔한 실수 한 문장(없으면 "").
- 문장은 짧게, 한 단계에 한 동작 위주로.
${hasVideo ? `- 장면 시점: 각 단계마다 영상에서 그 동작이 나오는 구간을 clip {"start":"MM:SS","end":"MM:SS"}로, 그 단계의 결과·상태가 가장 잘 보이는 순간을 photo "MM:SS"로 적는다. 실제 화면 프레임 기준으로만 적고, 영상에 안 나온 단계는 clip과 photo를 null로 한다.` : ''}${nImg ? `- 장면 번호: 각 단계에 가장 잘 맞는 이미지 번호를 frame(0부터, 이미지 순서)으로 적는다. 맞는 이미지가 없으면 null.` : ''}

[장보기 — 간단하게]
- buy: 장을 봐야 하는 재료만 true. 물, 소금, 후추, 설탕, 식용유, 간장, 참기름, 다진마늘처럼 대부분 집에 있는 기본 양념은 false.
- brand: 영상·캡션에 특정 브랜드 제품이 나오거나, 일반 마트에서 찾기 힘든 재료면 제품명(예: "청정원 맛술", "스리라차 소스"). 아니면 "".
- tools: 프라이팬·냄비·칼·도마·볼·숟가락·계량스푼 같은 기본 도구는 넣지 않는다. 에어프라이어, 토치, 체망, 특정 틀처럼 없을 수도 있는 도구만. 없으면 빈 배열.
- buy_keyword: 쇼핑 검색어(브랜드가 있으면 브랜드 포함).

출력 JSON 형식(이 키만 사용):
{"title":"","emoji":"🍳","summary":"한 줄","servings":2,"difficulty":"쉬움|보통|어려움","total_min":15,"confidence":"high|medium|low","assumptions":[""],
"ingredients":[{"name":"","group":"주재료|양념|기타","original":"영상·캡션 원문 표현","orig_qty":2,"orig_unit":"숟갈","prep":"","grams":0,"ml":null,"count":null,"count_unit":null,"primary":"g|ml|count","estimated":false,"buy":true,"brand":"","buy_keyword":""}],
"steps":[{"text":"","heat":"중불","seconds":60,"cue":"","tip":"","mistake":""${hasVideo ? ',"clip":{"start":"00:05","end":"00:09"},"photo":"00:08"' : ''}${nImg ? ',"frame":0' : ''}}],
"tools":[{"name":"","buy_keyword":""}],
"nutrition_per_serving":{"kcal":0,"carb_g":0,"protein_g":0,"fat_g":0,"sugar_g":0,"sodium_mg":0},
"beginner_notes":["시작 전에 알아두면 좋은 점, 최대 3개"]}

${link ? `릴스 링크: ${link}\n` : ''}[작성자 캡션]
"""
${caption || '(없음)'}
"""
${comments.length ? `[작성자/레시피 댓글]\n"""\n${comments.join('\n---\n')}\n"""` : ''}`;
}

function parseRecipe(text) {
  try { const a = text.indexOf('{'), b = text.lastIndexOf('}'); return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

async function callGemini(key, model, parts, generationConfig, signal) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig }),
  });
  const data = await r.json().catch(() => ({}));
  const text = (data.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
  return { status: r.status, ok: r.ok, data, text, finish: data.candidates?.[0]?.finishReason || '' };
}

const DEADLINE_MS = 270_000; // Vercel 300초 제한 전에 스스로 정리하고 안내

// 핵심 처리. emit(event)로 진행 상황을 알린다 (스트리밍 모드에서 화면에 표시)
async function run(body, emit, t0) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { status: 500, json: { error: 'no_key' } };
  let caption = String(body.caption || '').slice(0, 8000);
  let comments = (Array.isArray(body.comments) ? body.comments : []).map(c => String(c).slice(0, 1500)).slice(0, 4);
  let videoUrl = body.videoUrl ? String(body.videoUrl) : null;
  let duration = Number(body.duration) || null;
  const link = String(body.link || '').slice(0, 500);
  const fromVideo = !!body.fromVideo;
  const images = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : [];
  for (const im of images) {
    if (!im || typeof im.data !== 'string' || !/^image\/(jpeg|png|webp)$/.test(im.mime) || im.data.length > MAX_IMAGE_B64) {
      return { status: 400, json: { error: 'bad_image' } };
    }
  }
  const notes = [];
  const code = shortcodeOf(link);

  // ⚡ 캐시: 누군가 이미 분석한 릴스면 바로 돌려준다 (Apify·Gemini 비용 0, 1초 이내)
  if (code && !images.length && !body.noCache) {
    const hit = await cacheGet(code);
    if (hit && hit.recipe) {
      emit({ stage: 'cached' });
      cachePatch(code, { hits: (hit.hits || 0) + 1 });
      return { status: 200, json: { text: JSON.stringify(hit.recipe), model: hit.model || 'cache', source: { ...(hit.source || {}), videoUrl: hit.video_url || null, cached: true } } };
    }
  }

  // 링크만 왔으면 서버가 릴스 정보를 직접 가져온다
  if (shortcodeOf(link) && !body.fetched && !images.length) {
    emit({ stage: 'fetch' });
    const m = await getReelMeta(link).catch(() => null);
    if (m) {
      caption = [caption, m.caption].filter(Boolean).join('\n\n'); comments = comments.length ? comments : m.comments;
      videoUrl = videoUrl || m.videoUrl; duration = duration || m.duration; notes.push(...m.notes);
      emit({ stage: 'fetched', caption: m.caption || '', comments: m.comments || [], videoUrl: !!m.videoUrl, duration: m.duration || null });
    }
  }

  let video = null;
  if (videoUrl && !images.length) { emit({ stage: 'download' }); video = await downloadVideo(videoUrl, notes); }
  if (!caption.trim() && !comments.length && !images.length && !video) return { status: 422, json: { error: 'need_input', notes } };

  // 설정 선택: 글 레시피가 있으면 빠르게, 화면만 있으면 꼼꼼하게, 긴 영상은 초당 장면 수를 줄여 시간 단축
  const textHasRecipe = RECIPE_HINT.test(caption + '\n' + comments.join('\n'));
  const visualOnly = !textHasRecipe && !!(video || images.length);
  const longVideo = !!video && ((duration && duration > 75) || video.bytes > 12 * 1024 * 1024);
  const fps = !video ? null : duration > 180 ? 0.25 : longVideo ? 0.5 : null; // 기본 1fps
  const primaryCfg = visualOnly && !longVideo
    ? { responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'medium' } }
    : { responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: visualOnly ? 'medium' : 'low' }, mediaResolution: 'MEDIA_RESOLUTION_LOW' };
  const plainCfg = { responseMimeType: 'application/json' };

  const buildParts = (withMeta) => {
    const parts = [{ text: buildPrompt({ caption, comments, link, nImg: images.length, fromVideo, hasVideo: !!video }) }];
    if (video) parts.push({ inline_data: { mime_type: video.mime, data: video.b64 }, ...(withMeta && fps ? { video_metadata: { fps } } : {}) });
    for (const im of images) parts.push({ inline_data: { mime_type: im.mime, data: im.data } });
    return parts;
  };
  let parts = buildParts(true);
  const source = { videoUrl: video && CDN_OK.test(videoUrl || '') ? videoUrl : null, duration, gotCaption: !!caption, gotComments: comments.length, gotVideo: !!video, visualOnly, longVideo, fps, caption: caption.slice(0, 3000), comments, notes };
  emit({ stage: 'analyze', visualOnly, longVideo, gotVideo: !!video, videoMB: video ? +(video.bytes / 1048576).toFixed(1) : 0 });

  const left = () => DEADLINE_MS - (Date.now() - t0);
  let lastErr = null;
  for (const model of MODELS) {
    let cfg = primaryCfg, r = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (left() < 8000) return { status: 504, json: { error: 'too_long', notes } };
      const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), left());
      try { r = await callGemini(key, model, parts, cfg, ctrl.signal); }
      catch (e) { if (e.name === 'AbortError') return { status: 504, json: { error: 'too_long', notes } }; throw e; }
      finally { clearTimeout(tm); }
      const msg = r.data?.error?.message || '';
      if (r.status === 400 && /thinking|media_?resolution|video_?metadata|fps|Unknown name|Invalid value/i.test(msg)) {
        if (cfg !== plainCfg || parts[1]?.video_metadata) { cfg = plainCfg; parts = buildParts(false); notes.push('plain_' + model); continue; }
      }
      if ((r.status === 503 || r.status === 500 || (!r.ok && r.status !== 429 && BUSY.test(msg))) && attempt < 2) { emit({ stage: 'busy', model }); await sleep(attempt ? 4000 : 1500); continue; }
      if (r.ok) {
        const rec = parseRecipe(r.text);
        const empty = !rec || !Array.isArray(rec.ingredients) || !rec.ingredients.length;
        if (empty && cfg !== plainCfg && (video || images.length) && left() > 60000) {
          notes.push('retry_' + (rec ? 'empty' : 'badjson') + '_' + r.finish); emit({ stage: 'retry' });
          cfg = plainCfg; parts = buildParts(false); continue;
        }
      }
      break;
    }
    const msg = r.data?.error?.message || '';
    if (r.status === 503 || r.status === 500 || (!r.ok && r.status !== 429 && BUSY.test(msg))) { lastErr = { busy: true }; continue; }
    if (r.status === 429) return { status: 429, json: { error: 'rate_limited' } };
    if (!r.ok) {
      console.error('Gemini error', model, r.status, msg.slice(0, 300));
      lastErr = { status: r.status, message: msg };
      if ([400, 403, 404].includes(r.status) && /model|no longer|not found|not supported/i.test(msg)) continue;
      break;
    }
    if (!r.text) return { status: 502, json: { error: 'empty_answer', finish: r.finish, notes } };
    // 결과 저장 (링크로 분석한 경우만, 레시피가 있을 때만)
    if (code && !images.length) {
      const rec = parseRecipe(r.text);
      if (rec && Array.isArray(rec.ingredients) && rec.ingredients.length) {
        const { notes: _n, ...src } = source;
        await cachePut(code, { recipe: rec, source: src, video_url: source.videoUrl, model });
      }
    }
    return { status: 200, json: { text: r.text, model, source } };
  }
  if (lastErr?.busy) return { status: 503, json: { error: 'busy' } };
  return { status: 502, json: { error: 'gemini', status: lastErr?.status, message: lastErr?.message || '', notes } };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const pass = process.env.APP_PASSCODE;
  if (pass && req.headers['x-app-passcode'] !== pass) return res.status(401).json({ error: 'passcode' });
  const body = req.body || {};
  const t0 = Date.now();

  // 스트리밍 모드: 진행 상황 + 5초마다 신호를 보내 휴대폰 네트워크가 연결을 끊지 않게 한다
  if (body.stream) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    const send = obj => { try { res.write(JSON.stringify(obj) + '\n'); } catch {} };
    send({ stage: 'start' });
    const hb = setInterval(() => send({ ping: Math.round((Date.now() - t0) / 1000) }), 5000);
    try {
      const out = await run(body, send, t0);
      send({ done: true, status: out.status, ...out.json });
    } catch (e) {
      console.error(e); send({ done: true, status: 500, error: 'server' });
    } finally { clearInterval(hb); res.end(); }
    return;
  }

  try {
    const out = await run(body, () => {}, t0);
    return res.status(out.status).json(out.json);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
}
