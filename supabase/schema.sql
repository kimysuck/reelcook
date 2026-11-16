-- 릴쿡 DB 설정
-- Supabase 대시보드 → SQL Editor → New query → 이 파일 전체를 붙여넣고 Run (한 번만)

-- ① 프로필: 구글 로그인하면 이름·사진이 자동으로 들어감
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  avatar text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "프로필 누구나 보기" on public.profiles;
create policy "프로필 누구나 보기" on public.profiles for select using (true);
drop policy if exists "내 프로필 수정" on public.profiles;
create policy "내 프로필 수정" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, avatar)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '요리하는 사람'),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ② 내 레시피 (본인만 보고 수정)
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  reel_code text,
  recipe jsonb not null,
  created_at timestamptz default now()
);
create index if not exists recipes_user_idx on public.recipes (user_id, created_at desc);
alter table public.recipes enable row level security;
drop policy if exists "내 레시피" on public.recipes;
create policy "내 레시피" on public.recipes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ③ 분석 결과 캐시 (서버만 읽고 씀 — 정책 없음 = 앱에서는 접근 불가)
create table if not exists public.reel_cache (
  code text primary key,
  recipe jsonb not null,
  source jsonb,
  video_url text,
  model text,
  hits int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.reel_cache enable row level security;

-- ④ 자랑 피드 (로그인한 사람은 모두 보기, 글은 본인만 쓰고 지움)
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  body text check (char_length(body) <= 500),
  taste smallint default 0 check (taste between 0 and 5),
  photo_path text,
  recipe jsonb,
  created_at timestamptz default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
alter table public.posts enable row level security;
drop policy if exists "피드 보기" on public.posts;
create policy "피드 보기" on public.posts for select to authenticated using (true);
drop policy if exists "내 글 쓰기" on public.posts;
create policy "내 글 쓰기" on public.posts for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "내 글 지우기" on public.posts;
create policy "내 글 지우기" on public.posts for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.likes (
  post_id uuid references public.posts on delete cascade,
  user_id uuid default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);
alter table public.likes enable row level security;
drop policy if exists "하트 보기" on public.likes;
create policy "하트 보기" on public.likes for select to authenticated using (true);
drop policy if exists "내 하트 누르기" on public.likes;
create policy "내 하트 누르기" on public.likes for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "내 하트 취소" on public.likes;
create policy "내 하트 취소" on public.likes for delete to authenticated using ((select auth.uid()) = user_id);

-- ⑤ 사진 저장소: 누구나 볼 수 있고, 본인 폴더에만 올리고 지움
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "사진 올리기" on storage.objects;
create policy "사진 올리기" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "사진 지우기" on storage.objects;
create policy "사진 지우기" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ⑥ v0.9 추가분

-- 피드: 글 종류(레시피 공유/요리 인증) + 검토 결과
alter table public.posts add column if not exists kind text not null default 'cook';
alter table public.posts add column if not exists flagged boolean not null default false;
alter table public.posts add column if not exists flag_reason text;
alter table public.posts drop constraint if exists posts_kind_check;
alter table public.posts add constraint posts_kind_check check (kind in ('recipe','cook'));

-- 프로필: 처음 설정 여부 + 사진 검토 결과
alter table public.profiles add column if not exists setup_done boolean not null default false;
alter table public.profiles add column if not exists avatar_flagged boolean not null default false;

-- 글 쓰기·프로필 수정·사진 올리기는 이제 서버(검토 후)만 할 수 있음
drop policy if exists "내 글 쓰기" on public.posts;
drop policy if exists "내 프로필 수정" on public.profiles;
drop policy if exists "사진 올리기" on storage.objects;

-- 릴쿡 v1.2: 약관 동의 기록 (한 번만 실행)
-- 본인만 볼 수 있고, 쓰기는 서버(비밀 키)만 한다. 탈퇴하면 함께 지워진다.
create table if not exists public.consents (
  user_id uuid primary key references public.profiles on delete cascade,
  terms_version text not null,
  agreed_at timestamptz not null default now()
);
alter table public.consents enable row level security;
drop policy if exists "내 동의 기록 보기" on public.consents;
create policy "내 동의 기록 보기" on public.consents for select to authenticated using (user_id = (select auth.uid()));

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

-- v1.8: 앱을 꺼도 서버가 분석을 이어서 하기 위한 "분석 작업" 표
-- 서버(비밀 키)만 읽고 쓴다. 정책이 없으니 앱(로그인 사용자)은 직접 접근할 수 없다.
-- 결과를 앱이 받아 가면 바로 지우고, 남은 것도 3일 뒤 서버가 지운다.

create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner text not null,          -- 'd:기기 무작위 번호의 해시' (이 폰에서 맡긴 작업만 이 폰이 본다)
  who text,                     -- 하루 횟수 제한용 ('u:계정ID' 또는 'ip:해시')
  tester boolean not null default false,
  prio int not null default 0,  -- 0 보통 분석, 1 평가 모드 (보통 분석을 먼저)
  link text,
  body jsonb,                   -- 분석 요청(링크, 다시 분석 여부)
  status text not null default 'queued',   -- queued | running | done | failed
  stage text,                   -- 지금 단계(릴스 정보, 영상 받기, AI 분석 …)
  hop int not null default 0,   -- 이어서 분석한 횟수
  state jsonb,                  -- 이어서 분석할 때 넘길 상태 (끝나면 지움)
  result jsonb                  -- 분석 결과 (앱이 받아 가면 행째 지움)
);
create index if not exists analysis_jobs_owner_idx on public.analysis_jobs (owner, created_at desc);
create index if not exists analysis_jobs_status_idx on public.analysis_jobs (status, prio, created_at);
alter table public.analysis_jobs enable row level security;

-- v1.9: 안전망 — 1분마다 "멈춘 분석 작업"을 다시 시작시킨다
-- 앱을 꺼 둔 상태에서 서버의 다음 단계 호출이 끊겨도, 1분 안에 이어서 분석하고 알림을 보낸다.
-- Supabase가 릴쿡 서버 주소를 1분마다 한 번 부를 뿐, 개인정보는 오가지 않는다.
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'reelcook-sweep';
select cron.schedule('reelcook-sweep', '* * * * *',
  $$ select net.http_post(url := 'https://reelcook.vercel.app/api/jobs?sweep=1', body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb) $$);

-- 2026-11-15 보안·성능 점검 반영 (update-2026-11-15-security.sql)
revoke execute on function public.handle_new_user() from anon, authenticated, public;
create index if not exists likes_user_id_idx on public.likes (user_id);
create index if not exists posts_user_id_idx on public.posts (user_id);

-- v1.11 (피드백 2차): 운영 통계 · 사용 후기 · 보안 정책 성능

-- ① 운영 통계 (F-A1·F-J3·F-U4): 날짜별 분석 수·실패 수·처리 시간·토큰·Apify 호출. 누가 요청했는지는 남기지 않는다. 30일 보관.
create table if not exists public.analysis_stats (
  day date not null,            -- 한국 시간 기준 날짜
  kind text not null,           -- ok(새로 분석 성공) · cached(저장된 분석) · fail(실패) · tok(토큰) · apify(릴스 정보 조회)
  n int not null default 0,
  sec bigint not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  primary key (day, kind)
);
alter table public.analysis_stats enable row level security;
create or replace function public.bump_analysis_stats(p_day date, p_kind text, p_n int, p_sec bigint, p_in bigint, p_out bigint) returns void
language sql security definer set search_path = public as $$
  insert into public.analysis_stats as s (day, kind, n, sec, tokens_in, tokens_out) values (p_day, p_kind, p_n, p_sec, p_in, p_out)
  on conflict (day, kind) do update set n = s.n + p_n, sec = s.sec + p_sec, tokens_in = s.tokens_in + p_in, tokens_out = s.tokens_out + p_out;
$$;
revoke all on function public.bump_analysis_stats(date, text, int, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.bump_analysis_stats(date, text, int, bigint, bigint, bigint) to service_role;

-- ② 사용 후기 (F-J2): 익명 설문. 같은 폰은 한 번만(기기 무작위 번호의 해시). 1년 보관 후 서버가 지운다.
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  owner text unique,                 -- 'd:기기 번호 해시' (중복 방지용, 사람을 알아볼 수 없음)
  sus smallint[] not null,           -- SUS 10문항, 1~5점
  cook_min smallint,                 -- 릴스를 보고 요리를 시작하기까지 걸린 시간(분), 모르면 null
  comment text check (char_length(comment) <= 200)
);
alter table public.feedback enable row level security;

create table if not exists public.analysis_lessons (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  rule text not null check (char_length(rule) <= 200),  -- 일반 규칙 한 문장
  kind text,                                            -- ingredients · amounts · steps · method · other
  source text,                                          -- judge(AI 채점) · human(테스터 평가)
  first_code text, last_code text,                      -- 처음·마지막으로 이 실수가 나온 릴스 코드
  why text,                                             -- 학습 AI가 확인한 실수 내용
  model text,                                           -- 규칙을 만든 모델
  active boolean not null default true,                 -- 끄면 지시문에서 빠진다
  hits int not null default 1                           -- 같은 실수가 확인된 횟수
);
alter table public.analysis_lessons enable row level security;   -- 정책 없음 = 앱(로그인 이용자)은 못 읽고 서버만
