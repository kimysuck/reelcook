// 사진·글 검토 (Gemini). 부적절하면 앱이 만든 모자이크 버전만 저장된다.
const MODELS = [...new Set([process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'].filter(Boolean))];
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

export async function moderate({ imageB64 = null, mime = 'image/jpeg', text = '', purpose = 'post' }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('no_key');
  const parts = [{ text: PROMPT(purpose, String(text || '').slice(0, 2000)) }];
  if (imageB64) parts.push({ inline_data: { mime_type: mime, data: imageB64 } });
  const cfg = { responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' }, mediaResolution: 'MEDIA_RESOLUTION_MEDIUM' };
  let busy = false;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await sleep(attempt * 1500);
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: attempt === 2 ? { responseMimeType: 'application/json' } : cfg }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 503 || r.status === 500 || r.status === 429) { busy = true; continue; }
      if (r.status === 400 && attempt < 2) continue; // 옵션 미지원 → 다음 시도에서 기본 설정
      if (!r.ok) break; // 모델 없음 등 → 다음 모델
      const txt = (data.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
      // 안전 필터에 의해 답이 막힌 경우 = 부적절로 처리
      if (!txt && /SAFETY|PROHIBITED|BLOCK/i.test(data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || '')) {
        return { imageSafe: !imageB64 ? true : false, textSafe: true, category: 'other', reason: '자동 안전 필터에 걸렸어요' };
      }
      try {
        const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
        return { imageSafe: j.image_safe !== false, textSafe: j.text_safe !== false, category: j.category || 'none', reason: j.reason || '' };
      } catch { continue; }
    }
  }
  throw new Error(busy ? 'busy' : 'moderation_failed');
}
