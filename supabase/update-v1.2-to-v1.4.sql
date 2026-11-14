-- 릴쿡 v1.2 ~ v1.4 한 번에 (여러 번 실행해도 안전)

-- 본인만 볼 수 있고, 쓰기는 서버(비밀 키)만 한다. 탈퇴하면 함께 지워진다.
create table if not exists public.consents (
  user_id uuid primary key references public.profiles on delete cascade,
  terms_version text not null,
  agreed_at timestamptz not null default now()
);
alter table public.consents enable row level security;
drop policy if exists "내 동의 기록 보기" on public.consents;
create policy "내 동의 기록 보기" on public.consents for select to authenticated using (user_id = auth.uid());

-- 이미 올라간 레시피 공유 글에서 원작자 캡션·댓글·장면 사진 빼기 (원본 링크만 남김)
update public.posts
set recipe = (recipe - 'cover') || jsonb_build_object('source',
  case when recipe->'source'->>'link' is not null then jsonb_build_object('link', recipe->'source'->>'link') else '{}'::jsonb end)
where recipe is not null;

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
