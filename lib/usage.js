// Gemini 사용량 기록 (Supabase ai_usage 표). 무료 한도는 Google이 숫자를 API로 알려주지 않아서
// 우리가 직접 센다. 하루 기준은 Google과 같은 미국 태평양 시간 자정.
const URL_ = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = () => process.env.SUPABASE_SECRET_KEY || '';
const H = () => ({ apikey: KEY(), ...(KEY().startsWith('eyJ') ? { Authorization: `Bearer ${KEY()}` } : {}), 'Content-Type': 'application/json' });
const ready = () => !!(URL_() && KEY());

export function pacificDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
// 다음 초기화 시각(태평양 시간 자정)
export function nextReset(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(now).filter(x => x.type !== 'literal').map(x => [x.type, +x.value]));
  const passed = ((p.hour * 60 + p.minute) * 60 + p.second) * 1000;
  return new Date(now.getTime() + 86400000 - passed);
}

// 한 번 호출할 때마다 +1. 실패해도 분석은 계속한다.
export async function bumpUsage(model, { ok = 0, busy = 0, limited = 0, tin = 0, tout = 0, exhausted = false, err = null } = {}) {
  if (!ready()) return;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    await fetch(`${URL_()}/rest/v1/rpc/bump_ai_usage`, {
      method: 'POST', headers: H(), signal: ctrl.signal,
      body: JSON.stringify({ p_day: pacificDay(), p_model: model, p_ok: ok, p_busy: busy, p_limited: limited, p_in: tin, p_out: tout, p_exhausted: exhausted, p_err: err ? String(err).slice(0, 200) : null }),
    });
  } catch {} finally { clearTimeout(t); }
}

export async function todayUsage() {
  if (!ready()) return [];
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const r = await fetch(`${URL_()}/rest/v1/ai_usage?day=eq.${pacificDay()}&select=*`, { headers: H(), signal: ctrl.signal });
    return r.ok ? await r.json() : [];
  } catch { return []; } finally { clearTimeout(t); }
}
