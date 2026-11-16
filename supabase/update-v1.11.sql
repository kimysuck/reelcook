-- 릴쿡 v1.11 (피드백 2차): 운영 통계 · 사용 후기 · 보안 정책 성능 (한 번만 실행, 여러 번 실행해도 안전)

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

-- ③ 보안 정책 성능 (F-A3): auth.uid()를 (select auth.uid())로 — 동작은 같고, 행마다 다시 계산하지 않아 빠르다
drop policy if exists "내 레시피" on public.recipes;
create policy "내 레시피" on public.recipes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "내 글 지우기" on public.posts;
create policy "내 글 지우기" on public.posts for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "내 하트 누르기" on public.likes;
create policy "내 하트 누르기" on public.likes for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "내 하트 취소" on public.likes;
create policy "내 하트 취소" on public.likes for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "내 동의 기록 보기" on public.consents;
create policy "내 동의 기록 보기" on public.consents for select to authenticated using (user_id = (select auth.uid()));
