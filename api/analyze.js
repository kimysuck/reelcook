// 릴스 → 레시피. 캡션 · 댓글(작성자/시청자 구분) · 영상(화면 자막 + 음성) → Gemini → 레시피 여러 개까지
// Gemini API 키는 Vercel 환경변수 GEMINI_API_KEY에만 있고, 폰(브라우저)에는 절대 전달되지 않습니다.

import { getReelMeta, downloadVideo, shortcodeOf, CDN_OK, qtyCount } from '../lib/instagram.js';
import { cacheGet, cachePut, cachePatch } from '../lib/db.js';
import { generate } from '../lib/gemini.js';
import { bumpUsage } from '../lib/usage.js';

// Vercel 무료(Hobby) 플랜 최대 300초
export const config = { maxDuration: 300 };
const CACHE_V = 2;              // 분석 방식이 바뀌면 올린다 → 예전 캐시는 무시하고 다시 분석
const MAX_IMAGES = 24;
const MAX_IMAGE_B64 = 1_500_000;
const DEADLINE_MS = 270_000;    // Vercel 300초 제한 전에 스스로 정리하고 안내

function buildPrompt({ caption, comments, link, nImg, fromVideo, hasVideo, scanLog = null }) {
  const owner = comments.filter(c => c.owner), viewer = comments.filter(c => !c.owner);
  const fmt = list => list.map((c, i) => `(${i + 1})${c.likes ? ` [좋아요 ${c.likes}]` : ''} ${c.text}`).join('\n');
  return `너는 요리 초보를 위한 레시피 정리 전문가다. 인스타그램 릴스 자료를 보고, 그 안에 있는 레시피를 빠짐없이 찾아 그대로 따라 할 수 있게 JSON으로만 출력하라.


[1단계 — 근거 모으기: evidence를 먼저 채운다]
- speech: 영상 음성(내레이션·대사)에서 들은 재료와 분량만 150자 이내로 요약한다. 음성이 없거나 음악뿐이면 "".
- onscreen_text: 화면 자막·글자(재료 이름, 분량, 포장지 글씨)에서 읽은 재료와 분량만 150자 이내로 요약한다. 없으면 "".
- caption: 캡션에 레시피가 직접 적혀 있으면 "레시피", "레시피는 댓글/프로필에" 같은 안내만 있으면 "안내", 요리 내용이 없으면 "없음".
- comments_used: 실제로 레시피에 반영한 댓글 번호(예: "작성자 1", "시청자 3"). 안 썼으면 빈 배열.

[2단계 — 자료 판단 규칙]
- 작성자 캡션과 [작성자 댓글]은 공식 레시피다. 캡션이 "레시피는 댓글에"라고 하면 작성자 댓글에서 찾는다.
- [시청자 댓글]은 대부분 질문("레시피 알려주세요"), 칭찬, 자기 경험("저는 설탕 뺐어요"), 다른 요리 이야기다. 아래 세 가지를 모두 만족할 때만 보충 근거로 쓰고, 그 재료는 estimated를 true로 한다.
  (a) 이 영상과 같은 요리다 (b) 구체적인 재료·분량이 있다 (c) 영상·자막·캡션과 모순되지 않는다.
  질문, 개인 변형, 다른 요리의 레시피는 절대 넣지 않는다.
- 자료끼리 다르면 우선순위: 캡션·작성자 댓글 > 화면 자막 > 음성 > 화면을 보고 추정 > 시청자 댓글.
- 캡션·댓글이 없어도 영상만으로 반드시 레시피를 만든다. 자막과 음성을 꼼꼼히 확인하고, 그래도 분량이 없으면 화면 속 양(숟가락, 컵, 포장 크기)으로 추정해 estimated: true, 근거는 assumptions에 짧게.
- 요리·음식을 만드는 영상이 아니면(먹방, 맛집 소개, 광고만 등) is_food를 false, recipes를 빈 배열로 하고 reason에 이유를 한 줄로.

[3단계 — 레시피가 여러 개인 경우]
- 한 릴스에 서로 다른 완성 요리가 여러 개 나오면(예: "자취 반찬 3종", 캡션에 1. 2. 3. 으로 나뉜 레시피) recipes 배열에 요리마다 하나씩, 영상에 나온 순서대로 넣는다. 최대 6개.
- 같은 요리의 소스·양념장·토핑은 따로 나누지 않고 그 요리 안에 group "소스"로 넣는다.
- 같은 요리의 맛 변형(순한맛/매운맛)은 하나로 만들고 차이는 beginner_notes에 적는다.
- 각 레시피의 steps와 장면 시점은 그 요리 부분만 다룬다.

[분량 규칙 — 비율이 핵심]
- orig_qty/orig_unit: 자료에서 쓴 단위를 그대로(숟갈, 큰술, 작은술, 컵, 종이컵, 꼬집, 줌, 개, 대, 쪽, 봉, g, ml 등). "2숟갈"→ 2, "숟갈". "반 개"→ 0.5, "개". "약간·적당히·톡톡"→ orig_qty null, orig_unit "약간".
- 분량이 안 나오면 영상 속 양을 보고 그 영상에서 쓰는 단위(주로 숟갈)로 추정해 채우고 estimated: true.
- 같은 레시피 안에서 양념은 가능하면 같은 단위로 통일해 비율을 비교할 수 있게 한다.
- grams/ml: 정밀 모드 참고값. 한국 가정 기준(밥숟가락 1 ≈ 10ml, 계량스푼 1큰술 = 15ml, 작은술 = 5ml, 종이컵 ≈ 180ml, 한 꼬집 ≈ 0.5g, 대파 1대 ≈ 100g, 양파 1개 ≈ 200g, 달걀 1개 ≈ 50g, 마늘 1쪽 ≈ 5g).
- primary: "ml" 액체, "g" 고체·가루, "count" 달걀·통채소.
- original: 자료에 적힌 원문 표현(20자 이내, 없으면 생략). sources: 이 레시피를 만든 근거 종류("caption","owner_comment","viewer_comment","onscreen_text","speech","visual").

[단계]
- steps.text 안에서 재료는 반드시 [[재료번호]] 토큰(0부터, 그 레시피 ingredients 순서)으로 쓴다. 예: "팬에 [[0]]을 올려 굽는다".
- heat: "약불","중불","강불","불 끔","없음" 중 하나. seconds: 그 단계 소요 시간(초).
- cue: 다음 단계로 넘어가도 되는 상태(눈으로 확인 가능하게). tip: 초보 팁 한 문장. mistake: 흔한 실수 한 문장(없으면 "").
- 문장은 짧게, 한 단계에 한 동작 위주로.
${hasVideo ? `- cover_time: 완성된 음식(그릇·접시에 담긴 결과물)이 가장 크고 먹음직스럽게 보이는 순간 "MM:SS". 사람 얼굴·글자만 있는 화면, 재료 손질 장면은 피한다. 완성 장면이 없으면 마지막 단계 결과가 잘 보이는 순간.\n` : ''}${nImg ? `- cover_frame: 완성된 음식이 가장 잘 보이는 이미지 번호(0부터).\n` : ''}${hasVideo ? `- 장면 시점: 각 단계마다 영상에서 그 동작이 나오는 구간을 clip {"start":"MM:SS","end":"MM:SS"}로, 결과가 가장 잘 보이는 순간을 photo "MM:SS"로. 실제 화면 기준으로만 적고, 안 나온 단계는 null.` : ''}${nImg ? `- 장면 번호: 각 단계에 가장 잘 맞는 이미지 번호를 frame(0부터)으로. 없으면 null.` : ''}

[장보기 — 간단하게]
- buy: 장을 봐야 하는 재료만 true. 물, 소금, 후추, 설탕, 식용유, 간장, 참기름, 다진마늘 같은 기본 양념은 false.
- brand: 특정 브랜드 제품이 나오거나 일반 마트에서 찾기 힘든 재료면 제품명. 아니면 "".
- tools: 에어프라이어, 토치, 체망, 특정 틀처럼 없을 수도 있는 도구만. 기본 도구는 넣지 않는다.
- buy_keyword: 쇼핑 검색어.

출력 JSON(이 키만, 값이 없거나 null인 키는 생략해도 된다):
{"is_food":true,"reason":"","evidence":{"speech":"","onscreen_text":"","caption":"레시피|안내|없음","comments_used":[]},
"recipes":[{"title":"","summary":"한 줄",${hasVideo ? '"cover_time":"00:41",' : ''}${nImg ? '"cover_frame":3,' : ''}"servings":2,"difficulty":"쉬움|보통|어려움","total_min":15,"confidence":"high|medium|low","sources":["caption"],"assumptions":[""],
"ingredients":[{"name":"","group":"주재료|양념|소스|기타","original":"","orig_qty":2,"orig_unit":"숟갈","prep":"","grams":0,"ml":null,"count":null,"count_unit":null,"primary":"g|ml|count","estimated":false,"buy":true,"brand":"","buy_keyword":""}],
"steps":[{"text":"","heat":"중불","seconds":60,"cue":"","tip":"","mistake":""${hasVideo ? ',"clip":{"start":"00:05","end":"00:09"},"photo":"00:08"' : ''}${nImg ? ',"frame":0' : ''}}],
"tools":[{"name":"","buy_keyword":""}],
"nutrition_per_serving":{"kcal":0,"carb_g":0,"protein_g":0,"fat_g":0,"sugar_g":0,"sodium_mg":0},
"beginner_notes":["최대 3개"]}]}

자료: ${[caption ? '작성자 캡션' : null, owner.length ? `작성자 댓글 ${owner.length}개` : null, viewer.length ? `시청자 댓글 ${viewer.length}개` : null, hasVideo ? '릴스 영상(화면 + 음성)' : null, nImg ? `${fromVideo ? '영상에서 뽑은 장면' : '장면 스크린샷'} ${nImg}장` : null].filter(Boolean).join(', ')}
${scanLog ? `[영상 장면 기록 — 영상을 처음부터 끝까지 직접 보고 들은 기록이다. 이것을 주된 근거로 레시피를 만든다. 장면 시각을 clip·photo·cover_time에 그대로 쓴다. amount_seen을 그 영상의 단위(숟갈, 컵 등)로 바꿔 orig_qty/orig_unit에 넣고, 화면만 보고 정한 양은 estimated: true]\n"""\n${JSON.stringify(scanLog).slice(0, 24000)}\n"""\n` : ''}${link ? `릴스 링크: ${link}\n` : ''}[작성자 캡션]
"""
${caption || '(없음)'}
"""
[작성자 댓글]
${owner.length ? `"""\n${fmt(owner)}\n"""` : '(없음)'}
[시청자 댓글 — 대부분 레시피가 아님, 규칙대로만 사용]
${viewer.length ? `"""\n${fmt(viewer)}\n"""` : '(없음)'}`;
}

// 영상만으로 레시피를 만들어야 할 때 1단계: 장면 기록 (보고 듣는 일만)
function buildScanPrompt({ link }) {
  return `너는 요리 영상을 꼼꼼히 기록하는 사람이다. 레시피를 바로 만들지 말고, 영상을 처음부터 끝까지 빠짐없이 보고 들은 것을 장면별로 기록해 JSON으로만 출력하라.

[기록 규칙]
- 동작이 바뀔 때마다 새 장면으로 나눈다(재료 손질, 넣기, 섞기, 굽기, 담기 등). 최대 40장면.
- 장면마다 화면에 보이는 재료를 빠짐없이 적는다. 양은 보이는 그대로 묘사한다: "밥숟가락 수북이 2번", "종이컵 반", "계량컵 200ml 눈금까지", "포장지에 500g", "한 줌", "주먹만 한 양파 1개".
- 화면 자막·글자·포장지 글씨는 보이는 그대로 옮겨 적는다(외국어면 원문 그대로, 뜻을 괄호로).
- 음성 내레이션·대사에서 재료, 분량, 시간, 불 세기를 말하면 그대로 적는다. 음악뿐이면 "".
- 불 세기는 불꽃 크기·지글거림·끓는 정도로 판단한다(약불/중불/강불/없음).
- 걸린 시간을 알 수 있으면 적는다(자막 "3분", 화면 전환으로 짐작한 시간 등).
- 요리를 만드는 영상이 아니면(먹방, 맛집 소개, 완성품만 보여줌) is_cooking을 false로.
- 서로 다른 완성 요리가 여러 개면 dishes에 모두 적고, 장면마다 어느 요리인지 dish로 표시한다.

출력 JSON:
{"is_cooking":true,"reason":"","dishes":["요리 이름 추정"],"final_dish_time":"MM:SS",
"scenes":[{"start":"00:03","end":"00:07","dish":"","action":"","ingredients":[{"name":"","amount_seen":"","from":"자막|음성|포장지|화면"}],"heat":"중불","onscreen_text":"","speech":""}]}
${link ? `\n릴스 링크: ${link}` : ''}`;
}
const parseJ = t => { try { const a = t.indexOf('{'), b = t.lastIndexOf('}'); return JSON.parse(t.slice(a, b + 1)); } catch { return null; } };

export function parseResult(text) {
  let j = null;
  try { const a = text.indexOf('{'), b = text.lastIndexOf('}'); j = JSON.parse(text.slice(a, b + 1)); } catch { return null; }
  if (!j || typeof j !== 'object') return null;
  if (!Array.isArray(j.recipes)) j = { is_food: true, recipes: Array.isArray(j.ingredients) ? [j] : [] }; // 예전 형식
  j.recipes = j.recipes.filter(r => r && Array.isArray(r.ingredients) && r.ingredients.length && Array.isArray(r.steps) && r.steps.length).slice(0, 6);
  return j;
}

// 댓글 형식 통일: 서버가 가져온 {text, owner, likes} 또는 예전 앱이 보낸 문자열
const normComments = list => {
  const all = (Array.isArray(list) ? list : []).map(c => typeof c === 'string' ? { text: c, owner: false, likes: 0 } : c)
    .filter(c => c && typeof c.text === 'string' && c.text.trim()).map(c => ({ text: c.text.slice(0, c.owner ? 2000 : 300), owner: !!c.owner, likes: +c.likes || 0 }));
  return [...all.filter(c => c.owner).slice(0, 5), ...all.filter(c => !c.owner).slice(0, 8)];   // 시청자 댓글은 앞쪽(분량·좋아요 순) 8개만
};
const showComments = list => list.map(c => (c.owner ? '작성자: ' : '') + c.text);

async function run(body, emit, t0) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { status: 500, json: { error: 'no_key' } };
  let caption = String(body.caption || '').slice(0, 8000);
  let comments = normComments(body.comments);
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

  // ⚡ 캐시: 같은 방식(CACHE_V)으로 분석한 결과만 바로 돌려준다
  if (code && !images.length && !body.noCache) {
    const hit = await cacheGet(code);
    if (hit && hit.recipe && hit.source && hit.source.v === CACHE_V) {
      emit({ stage: 'cached' });
      cachePatch(code, { hits: (hit.hits || 0) + 1 });
      bumpUsage('cache', { ok: 1 });
      return { status: 200, json: { text: JSON.stringify(hit.recipe), model: hit.model || 'cache', source: { ...(hit.source || {}), videoUrl: hit.video_url || null, cached: true } } };
    }
  }

  if (code && !body.fetched && !images.length) {
    emit({ stage: 'fetch' });
    const m = await getReelMeta(link).catch(() => null);
    if (m) {
      caption = [caption, m.caption].filter(Boolean).join('\n\n'); if (!comments.length) comments = normComments(m.comments);
      videoUrl = videoUrl || m.videoUrl; duration = duration || m.duration; notes.push(...m.notes);
      emit({ stage: 'fetched', caption: m.caption || '', comments: showComments(comments), videoUrl: !!m.videoUrl, videoSrc: m.videoUrl && CDN_OK.test(m.videoUrl) ? m.videoUrl : null, duration: m.duration || null });
    }
  }

  let video = null;
  if (videoUrl && !images.length) { emit({ stage: 'download' }); video = await downloadVideo(videoUrl, notes); }
  if (!caption.trim() && !comments.length && !images.length && !video) return { status: 422, json: { error: 'need_input', notes } };

  // 글에 분량이 충분히 적혀 있으면 빠르게, 아니면 영상 자막까지 읽을 수 있게 고화질(프레임당 280토큰)로 꼼꼼하게
  const strongText = qtyCount(caption) >= 3 || comments.some(c => c.owner && qtyCount(c.text) >= 3);
  const visual = !!(video || images.length);
  const dur = duration || (video ? video.bytes / (350 * 1024) : 0);   // 길이를 모르면 용량으로 짐작
  // 토큰 절약: 영상 토큰 = 장면 수 × (고화질 280 / 저화질 70). 자막은 보통 2초 이상 떠 있어서 2초에 1장이면 읽힌다.
  const fps = !video ? null : strongText ? (dur > 60 ? 0.25 : 0.5) : dur > 180 ? 0.25 : dur > 90 ? 0.33 : dur > 30 ? 0.5 : 1;
  const JSONC = { responseMimeType: 'application/json' };
  const cfgs = strongText
    ? [{ gen: { ...JSONC, thinkingConfig: { thinkingLevel: 'low' }, mediaResolution: 'MEDIA_RESOLUTION_LOW' }, meta: true },
       ...(visual ? [{ gen: { ...JSONC, thinkingConfig: { thinkingLevel: 'medium' }, mediaResolution: 'MEDIA_RESOLUTION_HIGH' }, meta: true }] : []),
       { gen: JSONC, meta: false }]
    : [{ gen: { ...JSONC, thinkingConfig: { thinkingLevel: 'medium' }, ...(visual ? { mediaResolution: 'MEDIA_RESOLUTION_HIGH' } : {}) }, meta: true },
       { gen: JSONC, meta: false }];

  const prompt = buildPrompt({ caption, comments, link, nImg: images.length, fromVideo, hasVideo: !!video });
  const buildParts = cfg => {
    const parts = [{ text: prompt }];
    if (video) parts.push({ inline_data: { mime_type: video.mime, data: video.b64 }, ...(cfg.meta && fps && fps !== 1 ? { video_metadata: { fps } } : {}) });
    for (const im of images) parts.push({ inline_data: { mime_type: im.mime, data: im.data } });
    return parts;
  };
  const source = { v: CACHE_V, mode: null, videoUrl: video && CDN_OK.test(videoUrl || '') ? videoUrl : null, duration, gotCaption: !!caption, gotComments: comments.length,
    ownerComments: comments.filter(c => c.owner).length, gotVideo: !!video, visualOnly: !strongText && visual, fps, caption: caption.slice(0, 3000), comments: showComments(comments), notes };
  emit({ stage: 'analyze', visualOnly: source.visualOnly, longVideo: dur > 90, gotVideo: !!video, videoMB: video ? +(video.bytes / 1048576).toFixed(1) : 0 });

  const left = () => DEADLINE_MS - (Date.now() - t0);
  // 결과 검사: 요리 영상인데 레시피가 비면 다음 설정(더 꼼꼼하게)으로 다시
  const validate = text => { const j = parseResult(text); return !!j && (j.recipes.length > 0 || j.is_food === false); };

  // 영상만으로 만들어야 하는 릴스(캡션·작성자 댓글에 분량이 하나도 없음) → 처음부터 2단계(장면 기록 → 레시피)
  const textAny = qtyCount(caption) >= 1 || comments.some(c => c.owner && qtyCount(c.text) >= 1);
  const visualFirst = !!video && !textAny;
  // 2단계: ① 영상을 고화질로 장면별 기록 ② 기록(글)만 보고 레시피 정리
  const twoStage = async () => {
    emit({ stage: 'scan' });
    const sfps = dur > 120 ? 0.33 : dur > 60 ? 0.5 : 1;
    const scanCfgs = [{ gen: { ...JSONC, thinkingConfig: { thinkingLevel: 'low' }, mediaResolution: 'MEDIA_RESOLUTION_HIGH' }, meta: true }, { gen: JSONC, meta: false }];
    const scanParts = cfg => [{ text: buildScanPrompt({ link }) }, { inline_data: { mime_type: video.mime, data: video.b64 }, ...(cfg.meta && sfps !== 1 ? { video_metadata: { fps: sfps } } : {}) }];
    const sc = await generate({ key, cfgs: scanCfgs, buildParts: scanParts, validate: t => { const j = parseJ(t); return !!j && ((Array.isArray(j.scenes) && j.scenes.length > 0) || j.is_cooking === false); }, emit, left });
    if (!sc.ok) return sc;
    const log = parseJ(sc.text);
    if (!log) return { ok: false, reason: 'error', message: 'scan_parse' };
    if (log.is_cooking === false) return { ok: true, model: sc.model, mode: 'two_stage', text: JSON.stringify({ is_food: false, reason: log.reason || '요리 과정이 나오지 않는 영상', recipes: [] }) };
    emit({ stage: 'compose', scenes: (log.scenes || []).length });
    const p2 = buildPrompt({ caption, comments, link, nImg: 0, fromVideo: false, hasVideo: true, scanLog: log });
    const out2 = await generate({ key, cfgs: [{ gen: { ...JSONC, thinkingConfig: { thinkingLevel: 'medium' } } }, { gen: JSONC }], buildParts: () => [{ text: p2 }], validate, emit, left });
    if (out2.ok) out2.mode = 'two_stage';
    return out2;
  };

  let out;
  if (visualFirst) out = await twoStage();
  else {
    out = await generate({ key, cfgs, buildParts, validate, emit, left });
    // 한 번에 못 찾았으면(요리 아님 판정이 아닌데 레시피가 빔) 영상이 있으면 2단계로 한 번 더
    const r1 = out.ok ? parseResult(out.text) : null;
    if (video && out.ok && r1 && !r1.recipes.length && r1.is_food !== false && left() > 90000) { notes.push('fallback_two_stage'); out = await twoStage(); }
  }

  if (!out.ok) {
    if (out.reason === 'too_long') return { status: 504, json: { error: 'too_long', notes } };
    if (out.reason === 'quota_day') return { status: 429, json: { error: 'quota_day', resetAt: out.resetAt } };
    if (out.reason === 'quota') return { status: 429, json: { error: 'rate_limited', resetAt: out.resetAt } };
    if (out.reason === 'busy') return { status: 503, json: { error: 'busy' } };
    return { status: 502, json: { error: 'gemini', status: out.status, message: out.message || '', notes } };
  }
  const result = parseResult(out.text);
  if (!result) return { status: 502, json: { error: 'empty_answer', finish: out.finish, notes } };
  source.mode = out.mode || 'single';
  if (!result.recipes.length) return { status: 200, json: { text: JSON.stringify(result), model: out.model, source, noRecipe: true, notes } };
  if (code && !images.length) {
    const { notes: _n, ...src } = source;
    await cachePut(code, { recipe: result, source: src, video_url: source.videoUrl, model: out.model });
  }
  return { status: 200, json: { text: JSON.stringify(result), model: out.model, source } };
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
