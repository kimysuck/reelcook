// Vercel 서버리스 함수: 앱 → (이 함수) → Gemini API
// Gemini API 키는 Vercel 환경변수 GEMINI_API_KEY에만 있고, 폰(브라우저)에는 절대 전달되지 않습니다.

import { fetchInstagram, shortcodeOf } from '../lib/instagram.js';

// Vercel 무료(Hobby) 플랜 최대 300초. Apify(10~40초) + 영상 다운로드 + Gemini 영상 분석을 넉넉히 수용
export const config = { maxDuration: 300 };

// 모델은 자주 바뀌므로: 환경변수 GEMINI_MODEL이 있으면 그것을 먼저, 실패하면 다음 후보로 자동 전환
const MODELS = [...new Set([process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3.5-flash'].filter(Boolean))];
const MAX_IMAGES = 8;
const MAX_IMAGE_B64 = 1_500_000; // 이미지 1장당 약 1.1MB까지

function buildPrompt(caption, link, nImg, fromVideo, hasVideo) {
  return `너는 요리 초보를 위한 레시피 정리 전문가다. 아래는 인스타그램 요리 릴스에서 가져온 자료다(캡션 텍스트${hasVideo ? ', 릴스 영상 원본(화면과 음성 모두 확인할 것)' : ''}${nImg ? `, ${fromVideo ? '영상에서 순서대로 뽑은 장면' : '장면 스크린샷'} ${nImg}장` : ''}).
${hasVideo ? '영상 속 음성 설명, 화면 자막, 계량 장면을 꼼꼼히 확인해서 캡션에 없는 재료·분량·순서까지 채워라.\n' : ''}
이 자료를 분석해 요리 초보가 그대로 따라 할 수 있도록 "정확한 수치"로 바꾼 레시피를 JSON으로만 출력하라.

규칙:
- 모든 재료는 g(무게) 기준 수치를 반드시 추정해 넣는다. 액체·가루 양념은 ml도 넣는다. 셀 수 있는 재료(달걀, 양파 등)는 count/count_unit도 넣는다.
- 모호한 표현은 한국 가정 기준으로 환산한다: 밥숟가락 1숟갈 ≈ 10ml(액체) / 수북이 ≈ 계량스푼 1T, 반숟갈 ≈ 5ml, 한 꼬집 ≈ 0.5g, 대파 1대 ≈ 100g, 양파 1개(중) ≈ 200g, 숙주 1봉 ≈ 300g, 달걀 1개 ≈ 50g(껍질 제외), 마늘 1쪽 ≈ 5g, 다진마늘 1숟갈 ≈ 10g.
- 화면 속 자막·계량 장면(숟가락, 컵, 저울 숫자)이 보이면 그 정보를 우선한다.
- 원래 자료에 수치가 없거나 환산한 값이면 estimated: true. 원문 표현은 original에 그대로.
- primary는 초보가 계량할 때 가장 쉬운 단위: 양념 액체 "ml", 가루·고기·채소 "g", 달걀·통채소 "count".
- 단계(steps) 문장 안에서 재료를 언급할 때는 반드시 [[재료번호]] 토큰으로 쓴다(0부터, ingredients 배열 순서). 예: "팬에 [[0]]을 올려 굽는다".
- 각 단계: heat는 "약불","중불","강불","불 끔","없음" 중 하나. seconds는 그 단계 소요 시간(초). cue는 다음 단계로 넘어가도 되는 상태를 눈으로 확인할 수 있게 구체적으로. tip은 초보 팁, mistake는 흔한 실수(없으면 빈 문자열).
- tools: 필요한 조리도구(크기 포함). nutrition_per_serving: 1인분 기준 영양 추정. buy_keyword: 쇼핑몰 검색어.
- 레시피 자료가 아니거나 판단이 어렵다면 confidence를 "low"로 하고 assumptions에 이유를 적는다.

출력 JSON 형식:
{"title":"","emoji":"🍳","summary":"","servings":2,"difficulty":"쉬움|보통|어려움","total_min":15,"confidence":"high|medium|low","assumptions":[""],
"ingredients":[{"name":"","group":"주재료|양념|기타","original":"","prep":"","grams":0,"ml":null,"count":null,"count_unit":null,"primary":"g|ml|count","estimated":false,"buy_keyword":""}],
"steps":[{"text":"","heat":"중불","seconds":60,"cue":"","tip":"","mistake":""}],
"tools":[{"name":"","essential":true,"buy_keyword":""}],
"nutrition_per_serving":{"kcal":0,"carb_g":0,"protein_g":0,"fat_g":0,"sugar_g":0,"sodium_mg":0},
"beginner_notes":[""]}

${link ? `릴스 링크(참고용): ${link}\n` : ''}캡션/자막 텍스트:
"""
${caption || '(텍스트 없음 — 이미지만 보고 판단)'}
"""`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

  // 선택: 앱 비밀번호 (모르는 사람이 내 Gemini 사용량을 쓰지 못하게)
  const pass = process.env.APP_PASSCODE;
  if (pass && req.headers['x-app-passcode'] !== pass) return res.status(401).json({ error: 'passcode' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'no_key' });

  const body = req.body || {};
  const caption = String(body.caption || '').slice(0, 8000);
  const link = String(body.link || '').slice(0, 500);
  const fromVideo = !!body.fromVideo;
  const images = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : [];
  for (const im of images) {
    if (!im || typeof im.data !== 'string' || !/^image\/(jpeg|png|webp)$/.test(im.mime) || im.data.length > MAX_IMAGE_B64) {
      return res.status(400).json({ error: 'bad_image' });
    }
  }
  // 링크만 왔으면 → 서버가 인스타에서 캡션 + 영상을 직접 가져온다 (자동 분석)
  let ig = null, autoCaption = '';
  if (shortcodeOf(link) && !fromVideo && !images.length) {
    ig = await fetchInstagram(link).catch(() => null);
    if (ig) autoCaption = ig.caption || '';
  }
  const fullCaption = [caption, autoCaption && autoCaption !== caption ? autoCaption : ''].filter(Boolean).join('\n\n').slice(0, 8000);
  const hasVideo = !!(ig && ig.videoB64);

  if (!fullCaption.trim() && !images.length && !hasVideo) {
    return res.status(422).json({ error: 'need_input', notes: ig ? ig.notes : [] });
  }

  const parts = [{ text: buildPrompt(fullCaption, link, images.length, fromVideo, hasVideo) }];
  if (hasVideo) parts.push({ inline_data: { mime_type: ig.videoMime, data: ig.videoB64 } });
  for (const im of images) parts.push({ inline_data: { mime_type: im.mime, data: im.data } });
  const source = { auto: !!ig, gotCaption: !!autoCaption, gotVideo: hasVideo, caption: autoCaption.slice(0, 2000), notes: ig ? ig.notes : [] };

  try {
    let lastErr = null;
    for (const model of MODELS) {
      // 속도 최적화: 생각 수준 low + 영상 해상도 low (레시피 추출엔 충분). 지원 안 하는 모델이면 옵션 빼고 재시도
      const fast = { responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' }, mediaResolution: 'MEDIA_RESOLUTION_LOW' };
      const call = (generationConfig) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig }),
      });
      let r = await call(fast);
      let data = await r.json().catch(() => ({}));
      if (r.status === 400 && /thinking|media_?resolution|Unknown name|Invalid value/i.test(data?.error?.message || '')) {
        console.warn('fast options rejected, retrying plain:', data?.error?.message);
        r = await call({ responseMimeType: 'application/json' });
        data = await r.json().catch(() => ({}));
      }
      if (r.status === 429) return res.status(429).json({ error: 'rate_limited' });
      if (!r.ok) {
        const msg = data?.error?.message || '';
        console.error('Gemini error', model, r.status, msg.slice(0, 300));
        lastErr = { status: r.status, message: msg };
        // 모델이 없어졌거나 못 쓰는 경우에만 다음 모델로
        if ((r.status === 404 || r.status === 400 || r.status === 403) && /model|no longer|not found|not supported/i.test(msg)) continue;
        break;
      }
      const text = (data.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
      if (!text) return res.status(502).json({ error: 'empty_answer' });
      return res.status(200).json({ text, model, source });
    }
    return res.status(502).json({ error: 'gemini', status: lastErr?.status, message: lastErr?.message || '' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
}
