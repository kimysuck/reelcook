-- 릴쿡 v1.3: AI 사용량 기록 (한 번만 실행)
-- 개인정보 없음: 날짜(태평양 시간 기준) × 모델별 호출 수와 토큰 수만 센다. 서버(비밀 키)만 읽고 쓴다.
create table if not exists public.ai_usage (
  day date not null,
  model text not null,
  calls int not null default 0,
  ok int not null default 0,
  busy int not null default 0,
  limited int not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  day_exhausted boolean not null default false,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (day, model)
);
alter table public.ai_usage enable row level security;   -- 정책 없음 = 앱(로그인 사용자)은 접근 불가

create or replace function public.bump_ai_usage(p_day date, p_model text, p_ok int, p_busy int, p_limited int,
  p_in bigint, p_out bigint, p_exhausted boolean, p_err text) returns void
language sql security definer set search_path = public as $$
  insert into public.ai_usage as u (day, model, calls, ok, busy, limited, tokens_in, tokens_out, day_exhausted, last_error, updated_at)
  values (p_day, p_model, 1, p_ok, p_busy, p_limited, p_in, p_out, p_exhausted, p_err, now())
  on conflict (day, model) do update set
    calls = u.calls + 1, ok = u.ok + p_ok, busy = u.busy + p_busy, limited = u.limited + p_limited,
    tokens_in = u.tokens_in + p_in, tokens_out = u.tokens_out + p_out,
    day_exhausted = u.day_exhausted or p_exhausted,
    last_error = coalesce(p_err, u.last_error), updated_at = now();
$$;
revoke all on function public.bump_ai_usage(date, text, int, int, int, bigint, bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(date, text, int, int, int, bigint, bigint, boolean, text) to service_role;

-- 30일 지난 기록 정리
delete from public.ai_usage where day < current_date - 30;
