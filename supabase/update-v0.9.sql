-- 릴쿡 v0.9 DB 업데이트 (schema.sql을 이미 실행한 뒤, 이것만 한 번 실행)
-- SQL Editor → New query → 전체 붙여넣기 → Run

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
