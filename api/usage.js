// 오늘의 AI 사용량 (설정 화면용). 무료 한도 숫자는 Google이 API로 주지 않아 AI Studio 링크를 함께 준다.
import { todayUsage, pacificDay, nextReset } from '../lib/usage.js';
import { MODELS } from '../lib/gemini.js';
import { recentFailures, DAILY_LIMIT, isTester, whoOf, usedToday, kstMidnight } from '../lib/quota.js';
import { verifyUser } from '../lib/auth.js';

export default async function handler(req, res) {
  const pass = process.env.APP_PASSCODE;
  if (pass && req.headers['x-app-passcode'] !== pass) return res.status(401).json({ error: 'passcode' });
  const user = req.headers.authorization ? await verifyUser(req).catch(() => null) : null;
  res.setHeader('Cache-Control', 'no-store');
  // 일반 이용자는 "오늘 남은 분석 횟수"만 (모델별 사용량·실패 기록은 테스터 전용, F-A1·영석님 결정 7)
  if (!isTester(user)) {
    const used = await usedToday(whoOf(req, user));
    return res.status(200).json({ tester: false, dailyLimit: DAILY_LIMIT, used, left: Math.max(0, DAILY_LIMIT - used), resetAt: kstMidnight().toISOString() });
  }
  const [rows, fails] = await Promise.all([todayUsage(), recentFailures(10)]);
  return res.status(200).json({
    day: pacificDay(), resetAt: nextReset().toISOString(), models: MODELS,
    rows: rows.map(r => ({ model: r.model, calls: r.calls, ok: r.ok, busy: r.busy, limited: r.limited, tin: r.tokens_in, tout: r.tokens_out, exhausted: r.day_exhausted, lastError: r.last_error })),
    tracking: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY),
    studio: 'https://aistudio.google.com/usage?timeRange=last-28-days&tab=rate-limit',
    dailyLimit: DAILY_LIMIT, failures: fails, tester: true,   // 평가 모드·사용량 화면은 테스터에게만 보인다
  });
}
