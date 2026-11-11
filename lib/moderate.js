// 사진·글 검토 (Gemini). 부적절하면 앱이 만든 모자이크 버전만 저장된다.
import { generate } from './gemini.js';

const PROMPT = (purpose, texts) => `너는 한국 요리 커뮤니티 앱의 콘텐츠 검토 담당이다. 아래 ${purpose === 'avatar' ? '프로필 사진과 닉네임' : '게시글 사진과 글'}이 다른 사용자에게 보여도 되는지 판단해 JSON으로만 답하라.

부적절(unsafe)로 판단하는 경우:
- sexual: 노출·성적인 사진이나 글
- violence: 폭력, 유혈, 잔인한 장면, 무기로 위협
- hate: 혐오 표현·상징, 특정 집단 비하, 욕설·모욕
- self_harm: 자해·자살 관련
- drugs: 불법 약물
- privacy: 신분증, 카드번호, 주소·전화번호 등 개인정보가 읽히는 사진
- other: 그 밖에 명백히 불쾌하거나 공공장소에 부적절한 것

요리·음식·주방·사람 얼굴·셀카·풍경·반려동물·캐릭터 그림처럼 평범한 것은 safe다. 음식이 맛없어 보이거나 사진이 흐린 것은 safe다. 애매하면 safe로 하되 명백한 경우만 unsafe로 한다.
image_safe는 사진만, text_safe는 글만 따로 판단한다(사진이나 글이 없으면 true).

출력: {"image_safe":true,"text_safe":true,"category":"none|sexual|violence|hate|self_harm|drugs|privacy|other","reason":"한국어로 짧게"}

${texts ? `[글]\n"""\n${texts}\n"""` : '[글] 없음'}`;

const parseJ = t => { try { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { return null; } };

export async function moderate({ imageB64 = null, mime = 'image/jpeg', text = '', purpose = 'post' }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('no_key');
  const parts = [{ text: PROMPT(purpose, String(text || '').slice(0, 2000)) }];
  if (imageB64) parts.push({ inline_data: { mime_type: mime, data: imageB64 } });
  const t0 = Date.now();
  const out = await generate({
    key, buildParts: () => parts, left: () => 50000 - (Date.now() - t0),
    cfgs: [{ gen: { responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' }, mediaResolution: 'MEDIA_RESOLUTION_MEDIUM' } }, { gen: { responseMimeType: 'application/json' } }],
    validate: t => !!parseJ(t),
  });
  if (!out.ok) throw new Error(out.reason === 'busy' || out.reason.startsWith('quota') ? 'busy' : 'moderation_failed');
  const j = parseJ(out.text);
  // 안전 필터에 의해 답이 막힌 경우 = 부적절로 처리
  if (!j && /SAFETY|PROHIBITED|BLOCK/i.test(out.finish + ' ' + out.block)) return { imageSafe: !imageB64, textSafe: true, category: 'other', reason: '자동 안전 필터에 걸렸어요' };
  if (!j) throw new Error('moderation_failed');
  return { imageSafe: j.image_safe !== false, textSafe: j.text_safe !== false, category: j.category || 'none', reason: j.reason || '' };
}
