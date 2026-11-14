-- 릴쿡 v1.4: 하루 분석 횟수 제한 + 실패 기록 (한 번만 실행)
-- 둘 다 서버(비밀 키)만 읽고 쓴다. 정책이 없으니 앱(로그인 사용자)은 접근할 수 없다.

create table if not exists public.analysis_quota (
  day date not null,            -- 한국 시간 기준 날짜
  who text not null,            -- 'u:계정ID' 또는 'ip:해시'(원래 IP는 저장하지 않음)
  n int not null default 0,
  primary key (day, who)
);
alter table public.analysis_quota enable row level security;

create or replace function public.bump_analysis_quota(p_day date, p_who text) returns int
language sql security definer set search_path = public as $$
  insert into public.analysis_quota as q (day, who, n) values (p_day, p_who, 1)
  on conflict (day, who) do update set n = q.n + 1
  returning n;
$$;
revoke all on function public.bump_analysis_quota(date, text) from public, anon, authenticated;
grant execute on function public.bump_analysis_quota(date, text) to service_role;

create table if not exists public.analysis_failures (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  reel_code text,               -- 공개 릴스 코드 (누가 요청했는지는 기록하지 않음)
  error text,
  notes text[],
  mode text,
  model text,
  sec int
);
alter table public.analysis_failures enable row level security;

-- 오래된 기록 정리 (횟수 기록 3일, 실패 기록 30일)
delete from public.analysis_quota where day < current_date - 3;
delete from public.analysis_failures where at < now() - interval '30 days';
