// 오늘의 AI 사용량 (설정 화면용). 무료 한도 숫자는 Google이 API로 주지 않아 AI Studio 링크를 함께 준다.
import { todayUsage, pacificDay, nextReset } from '../lib/usage.js';
import { MODELS } from '../lib/gemini.js';

export default async function handler(req, res) {
  const pass = process.env.APP_PASSCODE;
  if (pass && req.headers['x-app-passcode'] !== pass) return res.status(401).json({ error: 'passcode' });
  const rows = await todayUsage();
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    day: pacificDay(), resetAt: nextReset().toISOString(), models: MODELS,
    rows: rows.map(r => ({ model: r.model, calls: r.calls, ok: r.ok, busy: r.busy, limited: r.limited, tin: r.tokens_in, tout: r.tokens_out, exhausted: r.day_exhausted, lastError: r.last_error })),
    tracking: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY),
    studio: 'https://aistudio.google.com/usage?timeRange=last-28-days&tab=rate-limit',
  });
}
