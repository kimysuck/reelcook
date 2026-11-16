// 오늘의 AI 사용량 (설정 화면용). 무료 한도 숫자는 Google이 API로 주지 않아 AI Studio 링크를 함께 준다.
import { todayUsage, pacificDay, nextReset, usageSince } from '../lib/usage.js';
import { statsSince, feedbackSummary, saveFeedback } from '../lib/stats.js';
import { costUSD, KRW_PER_USD, PRICE_DATE } from '../lib/pricing.js';
import { ownerOf } from '../lib/jobs.js';
import { MODELS } from '../lib/gemini.js';
import { recentFailures, DAILY_LIMIT, isTester, whoOf, usedToday, kstMidnight } from '../lib/quota.js';
import { verifyUser } from '../lib/auth.js';

export default async function handler(req, res) {
  const pass = process.env.APP_PASSCODE;
  if (pass && req.headers['x-app-passcode'] !== pass) return res.status(401).json({ error: 'passcode' });
  const user = req.headers.authorization ? await verifyUser(req).catch(() => null) : null;
  res.setHeader('Cache-Control', 'no-store');
  // 사용 후기 남기기 (F-J2): 익명, 같은 폰은 한 번만 (함수 개수 제한 때문에 이 파일에 함께 둔다)
  if (req.method === 'POST') {
    const owner = ownerOf(req.headers['x-device']); if (!owner) return res.status(400).json({ error: 'device' });
    const b = (req.body || {}).feedback || {};
    const sus = Array.isArray(b.sus) && b.sus.length === 10 && b.sus.every(v => Number.isInteger(v) && v >= 1 && v <= 5) ? b.sus : null;
    if (!sus) return res.status(400).json({ error: 'sus' });
    const cook = Number.isInteger(b.cook) && b.cook >= 0 && b.cook <= 600 ? b.cook : null;
    const r = await saveFeedback(owner, { sus, cook, comment: String(b.comment || '').trim().slice(0, 200) });
    return res.status(r.ok ? 200 : r.error === 'already' ? 409 : 500).json(r);
  }
  // 일반 이용자는 "오늘 남은 분석 횟수"만 (모델별 사용량·실패 기록은 테스터 전용, F-A1·영석님 결정 7)
  if (!isTester(user)) {
    const used = await usedToday(whoOf(req, user));
    return res.status(200).json({ tester: false, dailyLimit: DAILY_LIMIT, used, left: Math.max(0, DAILY_LIMIT - used), resetAt: kstMidnight().toISOString() });
  }
  const [rows, fails, st7, use7, fb] = await Promise.all([todayUsage(), recentFailures(10), statsSince(7), usageSince(7), feedbackSummary()]);
  // 운영 지표 (F-A1): 오늘 · 최근 7일
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const agg = list => { const g = k => list.filter(r => r.kind === k); const sum = (k, f) => g(k).reduce((a, r) => a + Number(r[f]), 0);
    const ok = sum('ok', 'n'), fail = sum('fail', 'n');
    return { ok, cached: sum('cached', 'n'), fail, failRate: ok + fail ? Math.round(fail / (ok + fail) * 100) : null,
      avgSec: ok ? Math.round(sum('ok', 'sec') / ok) : null, apify: sum('apify', 'n'), tin: sum('tok', 'tokens_in'), tout: sum('tok', 'tokens_out') }; };
  const ops = { today: agg(st7.filter(r => r.day === today)), week: agg(st7) };
  // 비용 (F-J3): 최근 7일 모델별 토큰 × 요금표 ÷ 새로 분석한 건수(성공+실패)
  let list = 0, now = 0, unpriced = [];
  for (const r of use7) { if (r.model === 'cache') continue; const c = costUSD(r.model, Number(r.tokens_in), Number(r.tokens_out)); if (!c) { if (Number(r.tokens_in) + Number(r.tokens_out)) unpriced.push(r.model); continue; } list += c.list; now += c.now; }
  const nAn = ops.week.ok + ops.week.fail;
  const cost = { per: nAn ? { tin: Math.round(ops.week.tin / nAn), tout: Math.round(ops.week.tout / nAn), listKrw: Math.round(list / nAn * KRW_PER_USD), nowKrw: Math.round(now / nAn * KRW_PER_USD), usd: Math.round(list / nAn * 10000) / 10000 } : null,
    rate: KRW_PER_USD, priceDate: PRICE_DATE, unpriced: [...new Set(unpriced)] };
  return res.status(200).json({
    day: pacificDay(), resetAt: nextReset().toISOString(), models: MODELS,
    rows: rows.map(r => ({ model: r.model, calls: r.calls, ok: r.ok, busy: r.busy, limited: r.limited, tin: r.tokens_in, tout: r.tokens_out, exhausted: r.day_exhausted, lastError: r.last_error })),
    tracking: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY),
    studio: 'https://aistudio.google.com/usage?timeRange=last-28-days&tab=rate-limit',
    dailyLimit: DAILY_LIMIT, failures: fails, tester: true, ops, cost, feedback: fb,   // 평가 모드·사용량 화면은 테스터에게만 보인다
  });
}
