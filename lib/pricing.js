// Gemini 유료 등급 요금 (100만 토큰당 USD). 출처: 영석님이 확인한 Google AI 요금표, 기준일 2026-11-16.
// promo는 프로모션 가격과 끝나는 날. 요금이 바뀌면 이 표와 기준일만 고친다. 3.1 Pro는 20만 토큰 이하 기준.
export const PRICE_DATE = '2026-11-16';
export const KRW_PER_USD = 1360;   // 영석님 기준 환율 (2026-11-16)
const FLASH_NEW = { in: 1.50, out: 7.50, promo: { in: 0.75, out: 3.75, until: '2026-12-31' } };
const G4 = { in: 4.00, out: 20.00, promo: { in: 2.00, out: 10.00, until: '2026-11-30' } };
export const PRICES = {
  'gemini-3.8-flash': FLASH_NEW, 'gemini-3.7-flash': FLASH_NEW, 'gemini-3.6-flash': FLASH_NEW,
  'gemini-3.5-flash': { in: 1.50, out: 9.00 },
  'gemini-3.5-flash-lite': { in: 0.30, out: 2.50 },
  'gemini-3.1-flash-lite': { in: 0.25, out: 1.50 },
  'gemini-3.1-pro': { in: 2.00, out: 12.00 },
  'gemini-4-argon': G4, 'gemini-4-carbon': G4,
};
// 반환: {list: 정가 USD, now: 오늘 적용 가격 USD} 또는 요금표에 없으면 null
export function costUSD(model, tin, tout, today = new Date().toISOString().slice(0, 10)) {
  const p = PRICES[model]; if (!p) return null;
  const c = (x) => (tin * x.in + tout * x.out) / 1e6;
  return { list: c(p), now: p.promo && today <= p.promo.until ? c(p.promo) : c(p) };
}
